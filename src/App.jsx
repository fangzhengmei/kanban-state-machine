import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CardStatus, Card, Column } from './types';
import { 
  canMoveCardToColumn, 
  checkDependencies, 
  checkWIPLimit,
  getAvailableColumnsForCard,
  getValidTransitions,
  getStatusDisplayName,
  isFinalStatus,
  canAddDependency
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
  
  // 统一使用 getAvailableColumnsForCard 获取所有列的可用性信息
  // 这个函数内部已经包含了：状态转换检查、WIP 限制检查、依赖关系检查
  const allColumnsInfo = getAvailableColumnsForCard(card, columns, allCards);
  
  // 过滤出有效的目标列（状态转换合法的列）
  const validTargetColumns = allColumnsInfo.filter(col => 
    col.isValidTarget || 
    (col.status !== card.status && getValidTransitions(card.status).includes(col.status))
  );
  
  // 检查依赖关系（用于 UI 显示）
  const dependencyCheck = checkDependencies(card, allCards);
  
  // 检查是否被阻塞（有未完成的依赖）
  const isBlocked = !dependencyCheck.allowed && card.dependencies.length > 0;
  
  // 获取阻塞的卡片
  const blockingCards = dependencyCheck.blockingCards || [];

  // 处理移动到下一个状态
  const handleMove = (targetStatus) => {
    const targetColumn = allColumnsInfo.find(col => col.status === targetStatus);
    if (targetColumn && targetColumn.isValidTarget) {
      onMove(card.id, targetStatus);
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
          {validTargetColumns.length > 0 && !isBlocked && (
            <select 
              className="form-select"
              style={{ fontSize: '12px', padding: '4px 8px' }}
              onChange={(e) => e.target.value && handleMove(e.target.value)}
              defaultValue=""
              data-testid="move-select"
            >
              <option value="" disabled>移动到...</option>
              {validTargetColumns.map(col => (
                <option 
                  key={col.id} 
                  value={col.status}
                  disabled={!col.isValidTarget}
                >
                  {col.name} {!col.isValidTarget && `(${col.invalidReason || '不可用'})`}
                </option>
              ))}
            </select>
          )}
          {validTargetColumns.length > 0 && isBlocked && (
            <span 
              style={{ 
                fontSize: '12px', 
                color: '#e74c3c',
                padding: '4px 8px',
                backgroundColor: '#ffebe6',
                borderRadius: '4px'
              }}
            >
              有依赖未完成
            </span>
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
  mode, // 'create' or 'edit'
  defaultStatus = CardStatus.BACKLOG
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
        // 编辑模式：使用卡片的当前状态
        setTitle(card.title || '');
        setDescription(card.description || '');
        setStatus(card.status || CardStatus.BACKLOG);
        setDependencies(card.dependencies || []);
      } else {
        // 新建模式：使用传入的默认状态
        setTitle('');
        setDescription('');
        setStatus(defaultStatus);
        setDependencies([]);
      }
      setError('');
    }
  }, [isOpen, card, defaultStatus]);

  // 获取可用的依赖卡片（排除当前卡片自己，并检查循环依赖）
  const availableDependencies = useMemo(() => {
    if (!allCards) return [];
    return allCards
      .filter(c => !card || c.id !== card.id)
      .map(depCard => {
        // 对于已选中的依赖，总是显示为可用（因为已经通过检查）
        // 对于未选中的依赖，检查是否可以添加
        const isAlreadySelected = dependencies.includes(depCard.id);
        if (isAlreadySelected) {
          return { ...depCard, isAvailable: true, unavailableReason: null };
        }
        
        // 检查是否可以添加此依赖
        const result = canAddDependency(card?.id, depCard.id, allCards);
        return {
          ...depCard,
          isAvailable: result.allowed,
          unavailableReason: result.reason || null
        };
      });
  }, [allCards, card, dependencies]);

  // 处理保存
  const handleSave = () => {
    if (!title.trim()) {
      setError('请输入卡片标题');
      return;
    }

    // 最终检查所有选中的依赖是否有效（防止并发修改）
    if (card && dependencies.length > 0) {
      for (const depId of dependencies) {
        const result = canAddDependency(card.id, depId, allCards);
        if (!result.allowed && !card.dependencies.includes(depId)) {
          setError(result.reason || '依赖关系无效');
          return;
        }
      }
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
    const depCard = availableDependencies.find(d => d.id === depId);
    if (!depCard) return;

    setDependencies(prev => {
      if (prev.includes(depId)) {
        // 取消选择：总是允许
        return prev.filter(id => id !== depId);
      } else {
        // 选择：检查是否可以添加
        if (depCard.isAvailable) {
          return [...prev, depId];
        } else {
          // 显示错误提示
          setError(depCard.unavailableReason || '无法添加此依赖');
          return prev;
        }
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
              {availableDependencies.map(dep => {
                const isSelected = dependencies.includes(dep.id);
                const isDisabled = !dep.isAvailable && !isSelected;
                
                return (
                  <label 
                    key={dep.id} 
                    title={dep.unavailableReason || ''}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      backgroundColor: isSelected ? '#e3fcef' : isDisabled ? '#f0f0f0' : '#f4f5f7',
                      borderRadius: '4px',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      opacity: isDisabled ? 0.6 : 1
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => handleDependencyToggle(dep.id)}
                      style={{
                        cursor: isDisabled ? 'not-allowed' : 'pointer'
                      }}
                    />
                    <span style={{
                      color: isDisabled ? '#999' : 'inherit'
                    }}>
                      {dep.title}
                    </span>
                    {dep.unavailableReason && !isSelected && (
                      <span 
                        style={{
                          fontSize: '10px',
                          color: '#e74c3c',
                          marginLeft: '4px'
                        }}
                        title={dep.unavailableReason}
                      >
                        ⚠
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {availableDependencies.some(dep => !dep.isAvailable && !dependencies.includes(dep.id)) && (
              <div className="warning-message" style={{ fontSize: '12px', marginTop: '8px' }}>
                ⚠ 部分卡片不可选（可能导致循环依赖），悬停查看详情
              </div>
            )}
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
  }, [modalMode]);

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
        defaultStatus={defaultStatus}
      />
    </div>
  );
}

export default App;
