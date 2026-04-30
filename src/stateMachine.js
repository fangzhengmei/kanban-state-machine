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
// 检查顺序：状态转换 → 依赖关系 → WIP 限制
// 原因：如果卡片有未完成的依赖，它根本不应该被移动，无论 WIP 是否满
export function canMoveCardToColumn(card, targetColumn, allCards, allColumns) {
  if (!card || !targetColumn) return { allowed: false, reason: '无效的卡片或目标列' };
  
  // 1. 检查状态转换是否有效
  if (!canTransition(card.status, targetColumn.status)) {
    return { 
      allowed: false, 
      reason: `无法从"${getStatusDisplayName(card.status)}"直接移动到"${getStatusDisplayName(targetColumn.status)}"`,
      type: 'invalid_transition'
    };
  }
  
  // 2. 检查依赖关系（先于 WIP 检查，因为依赖未完成时根本不应该考虑移动）
  const dependencyCheck = checkDependencies(card, allCards);
  if (!dependencyCheck.allowed) {
    return {
      allowed: false,
      reason: dependencyCheck.reason,
      type: 'dependency_blocked',
      blockingCards: dependencyCheck.blockingCards
    };
  }
  
  // 3. 检查目标列的 WIP 限制
  const columnCards = allCards.filter(c => c.status === targetColumn.status && c.id !== card.id);
  if (columnCards.length >= targetColumn.wipLimit) {
    return { 
      allowed: false, 
      reason: `目标列"${targetColumn.name}"已达到 WIP 上限 (${targetColumn.wipLimit})`,
      type: 'wip_exceeded'
    };
  }
  
  return { allowed: true, type: 'allowed' };
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

// 检测循环依赖
export function checkCircularDependency(cardId, targetDepId, allCards, visited = new Set()) {
  // 如果已经访问过这个卡片，说明存在循环依赖
  if (visited.has(cardId)) {
    return { hasCircular: true, path: Array.from(visited).concat(cardId) };
  }
  
  // 标记当前卡片为已访问
  const newVisited = new Set(visited);
  newVisited.add(cardId);
  
  // 查找当前卡片
  const card = allCards.find(c => c.id === cardId);
  if (!card || !card.dependencies || card.dependencies.length === 0) {
    return { hasCircular: false };
  }
  
  // 检查每个依赖
  for (const depId of card.dependencies) {
    // 如果依赖的卡片就是目标依赖卡片，说明存在直接循环
    if (depId === targetDepId) {
      return { hasCircular: true, path: Array.from(newVisited).concat(depId) };
    }
    
    // 递归检查依赖的卡片
    const result = checkCircularDependency(depId, targetDepId, allCards, newVisited);
    if (result.hasCircular) {
      return result;
    }
  }
  
  return { hasCircular: false };
}

// 检查是否可以将 targetDepId 添加为 cardId 的依赖（防止循环依赖）
export function canAddDependency(cardId, targetDepId, allCards) {
  // 不能依赖自己
  if (cardId === targetDepId) {
    return { 
      allowed: false, 
      reason: '不能依赖自己' 
    };
  }
  
  // 检查是否已存在依赖
  const card = allCards.find(c => c.id === cardId);
  if (card && card.dependencies && card.dependencies.includes(targetDepId)) {
    return { 
      allowed: false, 
      reason: '已经存在此依赖' 
    };
  }
  
  // 检查循环依赖：如果我们让 cardId 依赖 targetDepId，是否会形成循环？
  // 方法：检查从 targetDepId 出发，是否能到达 cardId
  const circularResult = checkCircularDependency(targetDepId, cardId, allCards);
  if (circularResult.hasCircular) {
    // 获取循环路径中的卡片标题
    const pathCards = circularResult.path.map(id => {
      const c = allCards.find(card => card.id === id);
      return c ? `"${c.title}"` : id;
    });
    return { 
      allowed: false, 
      reason: `检测到循环依赖: ${pathCards.join(' → ')}`,
      circularPath: circularResult.path
    };
  }
  
  return { allowed: true };
}

// 获取可以作为当前卡片依赖的卡片列表
// 统一返回格式，包含 isAvailable 和 unavailableReason 字段
export function getAvailableDependencies(cardId, allCards) {
  if (!allCards || allCards.length === 0) return [];
  
  return allCards.map(depCard => {
    // 不能依赖自己
    if (cardId && cardId === depCard.id) {
      return {
        ...depCard,
        isAvailable: false,
        unavailableReason: '不能依赖自己'
      };
    }
    
    // 对于新卡片（没有 ID），检查是否会与已选中的依赖形成问题
    // 但新卡片不会被任何现有卡片依赖，所以不会形成循环
    // 不过我们仍然使用统一的检查逻辑
    const result = canAddDependency(cardId, depCard.id, allCards);
    return {
      ...depCard,
      isAvailable: result.allowed,
      unavailableReason: result.reason || null
    };
  });
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
