import { StateMachineConfig, CardStatus } from './types';

// 检查状态转换是否有效
export function canTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return false;
  
  const config = StateMachineConfig[fromStatus];
  if (!config) return false;
  
  return config.transitions.includes(toStatus);
}

// 获取可以转换到的状态列表
export function getValidTransitions(status) {
  if (!status) return [];
  
  const config = StateMachineConfig[status];
  if (!config) return [];
  
  return config.transitions;
}

// 检查是否为最终状态
export function isFinalStatus(status) {
  if (!status) return false;
  
  const config = StateMachineConfig[status];
  if (!config) return false;
  
  return config.isFinal;
}

// 获取状态的显示名称
export function getStatusDisplayName(status) {
  const statusNames = {
    [CardStatus.BACKLOG]: '待规划',
    [CardStatus.TODO]: '待办',
    [CardStatus.IN_PROGRESS]: '进行中',
    [CardStatus.REVIEW]: '审核中',
    [CardStatus.DONE]: '已完成',
  };
  
  return statusNames[status] || status;
}

// WIP 限制检查
export function checkWIPLimit(column, cards) {
  if (!column || !cards) return { allowed: true, currentCount: 0, limit: column?.wipLimit };
  
  const currentCount = cards.filter(card => card.status === column.status).length;
  const limit = column.wipLimit;
  
  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
    isExceeded: currentCount > limit,
  };
}

// 检查是否可以移动卡片到目标列
export function canMoveCardToColumn(card, targetColumn, allCards, allColumns) {
  if (!card || !targetColumn) return { allowed: false, reason: '无效的卡片或目标列' };
  
  // 检查状态转换是否有效
  if (!canTransition(card.status, targetColumn.status)) {
    return { 
      allowed: false, 
      reason: `无法从"${getStatusDisplayName(card.status)}"直接移动到"${getStatusDisplayName(targetColumn.status)}"` 
    };
  }
  
  // 检查目标列的 WIP 限制
  const columnCards = allCards.filter(c => c.status === targetColumn.status && c.id !== card.id);
  if (columnCards.length >= targetColumn.wipLimit) {
    return { 
      allowed: false, 
      reason: `目标列"${targetColumn.name}"已达到 WIP 上限 (${targetColumn.wipLimit})` 
    };
  }
  
  // 检查依赖关系
  const dependencyCheck = checkDependencies(card, allCards);
  if (!dependencyCheck.allowed) {
    return {
      allowed: false,
      reason: dependencyCheck.reason,
    };
  }
  
  return { allowed: true };
}

// 检查卡片的依赖关系
export function checkDependencies(card, allCards) {
  if (!card || !card.dependencies || card.dependencies.length === 0) {
    return { allowed: true };
  }
  
  const blockingCards = [];
  
  for (const depId of card.dependencies) {
    const depCard = allCards.find(c => c.id === depId);
    if (depCard) {
      // 只有当依赖的卡片处于非最终状态时才会阻塞
      if (!isFinalStatus(depCard.status)) {
        blockingCards.push(depCard);
      }
    }
  }
  
  if (blockingCards.length > 0) {
    const blockingTitles = blockingCards.map(c => `"${c.title}"`).join(', ');
    return {
      allowed: false,
      reason: `需要先完成依赖卡片: ${blockingTitles}`,
      blockingCards,
    };
  }
  
  return { allowed: true };
}

// 检查卡片是否被其他卡片依赖
export function getDependentCards(cardId, allCards) {
  return allCards.filter(card => card.dependencies && card.dependencies.includes(cardId));
}

// 获取卡片可以移动到的列
export function getAvailableColumnsForCard(card, allColumns, allCards) {
  if (!card || !allColumns) return [];
  
  const availableColumns = [];
  
  for (const column of allColumns) {
    const result = canMoveCardToColumn(card, column, allCards, allColumns);
    if (result.allowed) {
      availableColumns.push({
        ...column,
        isValidTarget: true,
      });
    } else {
      availableColumns.push({
        ...column,
        isValidTarget: false,
        invalidReason: result.reason,
      });
    }
  }
  
  return availableColumns;
}
