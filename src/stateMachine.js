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
// 统一返回格式，包含 type 字段
export function canAddDependency(cardId, targetDepId, allCards) {
  // 新建场景下（cardId 为 undefined），不做任何检查
  // 因为新卡片不会被任何现有卡片依赖，所以不会形成循环
  if (!cardId) {
    return { 
      allowed: true, 
      type: DependencyCheckType.VALID 
    };
  }

  // 获取当前卡片
  const card = allCards.find(c => c.id === cardId);
  // 获取目标依赖卡片
  const targetCard = allCards.find(c => c.id === targetDepId);
  
  // 1. 不能依赖自己
  if (cardId === targetDepId) {
    return { 
      allowed: false, 
      reason: '不能依赖自己',
      type: DependencyCheckType.SELF_DEPENDENCY
    };
  }
  
  // 2. 检查是否已存在依赖
  if (card && card.dependencies && card.dependencies.includes(targetDepId)) {
    return { 
      allowed: false, 
      reason: '已经存在此依赖',
      type: DependencyCheckType.DUPLICATE_DEPENDENCY
    };
  }
  
  // 3. 检查循环依赖：如果我们让 cardId 依赖 targetDepId，是否会形成循环？
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
      type: DependencyCheckType.CIRCULAR_DEPENDENCY,
      circularPath: circularResult.path
    };
  }
  
  return { 
    allowed: true, 
    type: DependencyCheckType.VALID 
  };
}

// 依赖检查的类型枚举
export const DependencyCheckType = {
  SELF_DEPENDENCY: 'self_dependency',
  DUPLICATE_DEPENDENCY: 'duplicate_dependency',
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  EXISTING_CIRCULAR: 'existing_circular',
  VALID: 'valid'
};

// 检查多个依赖项之间是否存在循环依赖
// 例如：用户选择 A 和 B 作为依赖，但 A 依赖 B，B 依赖 A
export function checkMultiDependencyCircular(dependencyIds, allCards) {
  if (!dependencyIds || dependencyIds.length <= 1) {
    return { hasCircular: false };
  }
  
  // 检查每对依赖项之间是否存在循环
  for (let i = 0; i < dependencyIds.length; i++) {
    for (let j = i + 1; j < dependencyIds.length; j++) {
      const id1 = dependencyIds[i];
      const id2 = dependencyIds[j];
      
      // 检查 id1 是否依赖 id2，并且 id2 是否依赖 id1
      const circular1 = checkCircularDependency(id1, id2, allCards);
      if (circular1.hasCircular) {
        // 获取循环路径中的卡片标题
        const pathCards = circular1.path.map(id => {
          const c = allCards.find(card => card.id === id);
          return c ? `"${c.title}"` : id;
        });
        return {
          hasCircular: true,
          reason: `选中的依赖项之间存在循环: ${pathCards.join(' → ')}`,
          type: DependencyCheckType.CIRCULAR_DEPENDENCY,
          circularPath: circular1.path
        };
      }
    }
  }
  
  return { hasCircular: false };
}

// 检查依赖项本身是否已经存在循环依赖
// 例如：用户选择 B 作为依赖，但 B 已经和 C 形成循环
export function checkExistingCircular(depId, allCards) {
  const depCard = allCards.find(c => c.id === depId);
  if (!depCard) {
    return { hasCircular: false };
  }
  
  // 检查从 depCard 出发，是否能回到自己（即自身存在循环）
  const result = checkCircularDependency(depId, depId, allCards);
  if (result.hasCircular) {
    const pathCards = result.path.map(id => {
      const c = allCards.find(card => card.id === id);
      return c ? `"${c.title}"` : id;
    });
    return {
      hasCircular: true,
      reason: `依赖项"${depCard.title}"本身存在循环依赖: ${pathCards.join(' → ')}`,
      type: DependencyCheckType.EXISTING_CIRCULAR,
      circularPath: result.path
    };
  }
  
  return { hasCircular: false };
}

// 统一的依赖验证函数 - 在保存时验证用户选择的所有依赖
// 检查优先级：
// 1. 不能依赖自己（最高优先级）
// 2. 不能有重复依赖
// 3. 选中的依赖项之间不能存在循环
// 4. 不能与现有卡片形成循环
export function validateDependencies(
  cardId,
  dependencyIds,
  allCards,
  options = { checkExistingCircular: true }
) {
  // 没有依赖，直接通过
  if (!dependencyIds || dependencyIds.length === 0) {
    return {
      allowed: true,
      type: DependencyCheckType.VALID
    };
  }

  // 1. 检查是否依赖自己
  if (cardId && dependencyIds.includes(cardId)) {
    const selfCard = allCards.find(c => c.id === cardId);
    return {
      allowed: false,
      reason: `不能依赖自己"${selfCard?.title || cardId}"`,
      type: DependencyCheckType.SELF_DEPENDENCY
    };
  }

  // 2. 检查是否有重复依赖
  const uniqueIds = new Set(dependencyIds);
  if (uniqueIds.size !== dependencyIds.length) {
    // 找出重复的项
    const duplicates = dependencyIds.filter((id, index) => dependencyIds.indexOf(id) !== index);
    const duplicateCards = duplicates.map(id => {
      const c = allCards.find(card => card.id === id);
      return c ? `"${c.title}"` : id;
    });
    return {
      allowed: false,
      reason: `存在重复依赖: ${duplicateCards.join(', ')}`,
      type: DependencyCheckType.DUPLICATE_DEPENDENCY
    };
  }

  // 3. 检查选中的依赖项之间是否存在循环
  const multiCircularResult = checkMultiDependencyCircular(dependencyIds, allCards);
  if (multiCircularResult.hasCircular) {
    return {
      allowed: false,
      reason: multiCircularResult.reason,
      type: multiCircularResult.type
    };
  }

  // 4. 检查是否与现有卡片形成循环（仅当 cardId 存在时，即编辑模式）
  if (cardId) {
    for (const depId of dependencyIds) {
      const result = canAddDependency(cardId, depId, allCards);
      if (!result.allowed) {
        return result;
      }
    }
  }

  // 5. 可选：检查依赖项本身是否已经存在循环
  if (options.checkExistingCircular) {
    for (const depId of dependencyIds) {
      const result = checkExistingCircular(depId, allCards);
      if (result.hasCircular) {
        // 注意：这里可以选择警告或阻止
        // 为了灵活性，我们返回一个特殊的类型，但允许操作
        // 用户可以决定是否继续
        return {
          allowed: true, // 允许，但给出警告
          warning: result.reason,
          type: DependencyCheckType.EXISTING_CIRCULAR,
          isWarning: true
        };
      }
    }
  }

  // 所有检查通过
  return {
    allowed: true,
    type: DependencyCheckType.VALID
  };
}

// 获取可以作为当前卡片依赖的卡片列表
// 统一返回格式，包含 isAvailable 和 unavailableReason 字段
// 检查优先级：
// 1. 不能依赖自己（最高优先级）
// 2. 已存在依赖（编辑模式下）
// 3. 会与现有卡片形成循环（编辑模式下）
// 4. 依赖项本身存在循环（警告，但不禁用）
export function getAvailableDependencies(cardId, allCards) {
  if (!allCards || allCards.length === 0) return [];
  
  return allCards.map(depCard => {
    // 1. 使用 canAddDependency 统一检查所有场景
    // 这个函数会处理：依赖自己、已存在依赖、循环依赖等
    const result = canAddDependency(cardId, depCard.id, allCards);
    
    // 2. 检查依赖项本身是否存在循环（警告级别，不禁用）
    const existingCircular = checkExistingCircular(depCard.id, allCards);
    
    // 3. 检查依赖项是否有自己的依赖（用于提示用户）
    const hasDependencies = depCard.dependencies && depCard.dependencies.length > 0;
    
    return {
      ...depCard,
      isAvailable: result.allowed,
      unavailableReason: result.reason || null,
      checkType: result.type || null,
      hasDependencies,
      existingCircular: existingCircular.hasCircular ? {
        hasCircular: true,
        reason: existingCircular.reason
      } : null
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
