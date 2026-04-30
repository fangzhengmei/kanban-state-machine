import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CardStatus, Card, Column } from './types';
import { 
  canMoveCardToColumn, 
  checkDependencies, 
  checkWIPLimit,
  getStatusDisplayName,
  getValidTransitions,
  isFinalStatus
} from './stateMachine';

// 初始列配置
const initialColumns = [
  new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity, order: 0 }),
  new Column({ id: 'col-todo', name: '待办', status: CardStatus.TODO, wipLimit: 5, order: 1 }),
  new Column({ id: 'col-in-progress', name: '进行中', status: CardStatus.IN_PROGRESS, wipLimit: 3, order: 2 }),
  new Column({ id: 'col-review', name: '审核中', status: CardStatus.REVIEW, wipLimit: 4, order: 3 }),
  new Column({ id: 'col-done', name: '已完成', status: CardStatus.DONE, wipLimit: Infinity, order: 4 }),
];

// 初始卡片数据
const initialCards = [
  new Card({ 
    id: 'card-1', 
    title: '设计用户界面原型', 
    description: '创建主要页面的 UI 原型，包括主页、登录页和仪表盘', 
    status: CardStatus.DONE,
    createdAt: new Date('2024-01-01')
  }),
  new Card({ 
    id: 'card-2', 
    title: '实现登录功能', 
    description: '开发用户登录和注册功能，包括表单验证和 API 集成', 
    status: CardStatus.IN_PROGRESS,
    dependencies: ['card-1'],
    createdAt: new Date('2024-01-02')
  }),
  new Card({ 
    id: 'card-3', 
    title: '编写测试用例', 
    description: '为核心功能编写单元测试和集成测试', 
    status: CardStatus.TODO,
    dependencies: ['card-2'],
    createdAt: new Date('2024-01-03')
  }),
  new Card({ 
    id: 'card-4', 
    title: '性能优化', 
    description: '分析并优化应用性能，包括代码分割和懒加载', 
    status: CardStatus.BACKLOG,
    createdAt: new Date('2024-01-04')
  }),
];

// 卡片组件
function KanbanCard({ card, allCards, columns, onMove, onEdit, onDelete }) {
  const [showActions, setShowActions] = useState(false);
  
  // 检查依赖关系
  const dependencyCheck = checkDependencies(card, allCards);
  
  // 获取可以移动到的列
  const validTransitions = getValidTransitions(card.status);
  const availableColumns = columns.filter(col => validTransitions.includes(col.status));
  
  // 检查是否被阻塞
  const isBlocked = !dependencyCheck.allowed && card.dependencies.length > 0;
  
  // 获取阻塞的卡片
  const blockingCards = dependencyCheck.blockingCards || [];

  // 处理移动到下一个状态
  const handleMove = (targetStatus) => {
    const targetColumn = columns.find(col => col.status === targetStatus);
    if (targetColumn) {
      const result = canMoveCardToColumn(card, targetColumn, allCards, columns);
      if (result.allowed) {
        onMove(card.id, targetStatus);
      }
    }
    setShowActions(false);
  };

  return (
    <div 
      className={`kanban-card ${isBlocked ? 'blocked' : ''} ${dependencyCheck.allowed ? 'ready' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="card-title">{card.title}</div>
      {card.description && (
        <div className="card-description">{card.description}</div>
      )}
      
      {card.dependencies.length > 0 && (
        <div className="card-meta">
          <div>
            {blockingCards.map(dep => (
              <span key={dep.id} className="dependency-tag pending">
                依赖: {dep.title}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {showActions && (
        <div className="card-actions">
          {availableColumns.length > 0 && !isBlocked && (
            <select 
              className="form-select"
              style={{ fontSize: '12px', padding: '4px 8px' }}
              onChange={(e) => e.target.value && handleMove(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>移动到...</option>
              {availableColumns.map(col => {
                const wipCheck = checkWIPLimit(col, allCards.filter(c => c.id !== card.id));
                return (
                  <option 
                    key={col.id} 
                    value={col.status}
                    disabled={!wipCheck.allowed}
                  >
                    {col.name} {!wipCheck.allowed && `(WIP已满)`}
                  </option>
                );
              })}
            </select>
          )}
          <button className="btn-edit" onClick={() => onEdit(card)}>编辑</button>
          <button className="btn-delete" onClick={() => onDelete(card.id)}>删除</button>
        </div>
      )}
    </div>
  );
}

// 列组件
function KanbanColumn({ column, cards, allCards, columns, onMove, onEdit, onDelete, onAddCard }) {
  const wipCheck = checkWIPLimit(column, cards);
  const columnCards = cards.filter(card => card.status === column.status);
  
  return (
    <div className="kanban-column">
      <div className="column-header">
        <h3 className="column-title">{column.name}</h3>
        <span className={`column-wip ${wipCheck.isExceeded ? 'exceeded' : ''}`}>
          {wipCheck.currentCount}{column.wipLimit !== Infinity ? `/${column.wipLimit}` : ''}
        </span>
      </div>
      
      {columnCards.map(card => (
        <KanbanCard
          key={card.id}
          card={card}
          allCards={allCards}
          columns={columns}
          onMove={onMove}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      
      <button 
        className="add-card-btn"
        onClick={() => onAddCard(column.status)}
      >
        <span>+</span>
        <span>添加卡片</span>
      </button>
    </div>
  );
}

// 卡片编辑模态框
function CardModal({ 
  isOpen, 
  card, 
  columns, 
  allCards, 
  onSave, 
  onClose,
  mode // 'create' or 'edit'
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(CardStatus.BACKLOG);
  const [dependencies, setDependencies] = useState([]);
  const [error, setError] = useState('');

  // 初始化表单
  React.useEffect(() => {
    if (isOpen) {
      if (card) {
        setTitle(card.title || '');
        setDescription(card.description || '');
        setStatus(card.status || CardStatus.BACKLOG);
        setDependencies(card.dependencies || []);
      } else {
        setTitle('');
        setDescription('');
        setStatus(status);
        setDependencies([]);
      }
      setError('');
    }
  }, [isOpen, card, status]);

  // 获取可用的依赖卡片（排除当前卡片自己）
  const availableDependencies = useMemo(() => {
    if (!allCards) return [];
    return allCards.filter(c => !card || c.id !== card.id);
  }, [allCards, card]);

  // 处理保存
  const handleSave = () => {
    if (!title.trim()) {
      setError('请输入卡片标题');
      return;
    }

    onSave({
      id: card?.id,
      title: title.trim(),
      description: description.trim(),
      status,
      dependencies,
    });
  };

  // 处理依赖选择
  const handleDependencyToggle = (depId) => {
    setDependencies(prev => {
      if (prev.includes(depId)) {
        return prev.filter(id => id !== depId);
      } else {
        return [...prev, depId];
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'create' ? '新建卡片' : '编辑卡片'}
          </h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label className="form-label">标题</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入卡片标题"
          />
        </div>

        <div className="form-group">
          <label className="form-label">描述</label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入卡片描述（可选）"
          />
        </div>

        <div className="form-group">
          <label className="form-label">状态</label>
          <select
            className="form-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {columns.map(col => (
              <option key={col.id} value={col.status}>
                {col.name}
              </option>
            ))}
          </select>
        </div>

        {availableDependencies.length > 0 && (
          <div className="form-group">
            <label className="form-label">依赖项</label>
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '8px',
              padding: '8px 0'
            }}>
              {availableDependencies.map(dep => (
                <label 
                  key={dep.id} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: dependencies.includes(dep.id) ? '#e3fcef' : '#f4f5f7',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={dependencies.includes(dep.id)}
                    onChange={() => handleDependencyToggle(dep.id)}
                  />
                  {dep.title}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-submit" onClick={handleSave}>
            {mode === 'create' ? '创建' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 主应用组件
function App() {
  const [cards, setCards] = useState(initialCards);
  const [columns] = useState(initialColumns);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [modalMode, setModalMode] = useState('create');
  const [defaultStatus, setDefaultStatus] = useState(CardStatus.BACKLOG);

  // 添加卡片
  const handleAddCard = useCallback((status = CardStatus.BACKLOG) => {
    setDefaultStatus(status);
    setEditingCard(null);
    setModalMode('create');
    setIsModalOpen(true);
  }, []);

  // 编辑卡片
  const handleEditCard = useCallback((card) => {
    setEditingCard(card);
    setModalMode('edit');
    setIsModalOpen(true);
  }, []);

  // 保存卡片
  const handleSaveCard = useCallback((cardData) => {
    if (modalMode === 'create') {
      const newCard = new Card({
        id: uuidv4(),
        ...cardData,
        status: defaultStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setCards(prev => [...prev, newCard]);
    } else {
      setCards(prev => prev.map(card => 
        card.id === cardData.id 
          ? { ...card, ...cardData, updatedAt: new Date() }
          : card
      ));
    }
    setIsModalOpen(false);
    setEditingCard(null);
  }, [modalMode, defaultStatus]);

  // 删除卡片
  const handleDeleteCard = useCallback((cardId) => {
    // 删除卡片时，同时删除其他卡片对它的依赖
    setCards(prev => {
      const remainingCards = prev.filter(card => card.id !== cardId);
      return remainingCards.map(card => ({
        ...card,
        dependencies: card.dependencies.filter(depId => depId !== cardId)
      }));
    });
  }, []);

  // 移动卡片
  const handleMoveCard = useCallback((cardId, targetStatus) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const targetColumn = columns.find(col => col.status === targetStatus);
    if (!targetColumn) return;

    const result = canMoveCardToColumn(card, targetColumn, cards, columns);
    if (result.allowed) {
      setCards(prev => prev.map(c => 
        c.id === cardId 
          ? { ...c, status: targetStatus, updatedAt: new Date() }
          : c
      ));
    }
  }, [cards, columns]);

  return (
    <div className="kanban-board">
      {columns.map(column => (
        <KanbanColumn
          key={column.id}
          column={column}
          cards={cards}
          allCards={cards}
          columns={columns}
          onMove={handleMoveCard}
          onEdit={handleEditCard}
          onDelete={handleDeleteCard}
          onAddCard={handleAddCard}
        />
      ))}

      <CardModal
        isOpen={isModalOpen}
        card={editingCard}
        columns={columns}
        allCards={cards}
        onSave={handleSaveCard}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
      />
    </div>
  );
}

export default App;
