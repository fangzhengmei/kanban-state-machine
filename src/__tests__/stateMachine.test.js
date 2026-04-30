import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getValidTransitions,
  isFinalStatus,
  getStatusDisplayName,
  checkWIPLimit,
  canMoveCardToColumn,
  checkDependencies,
  getDependentCards,
  getAvailableColumnsForCard,
  checkCircularDependency,
  canAddDependency,
  getAvailableDependencies,
  validateDependencies,
  checkMultiDependencyCircular,
  checkExistingCircular,
  DependencyCheckType
} from '../stateMachine';
import { CardStatus, Card, Column } from '../types';

describe('状态机测试', () => {
  describe('canTransition', () => {
    it('应该允许 BACKLOG 到 TODO 的转换', () => {
      expect(canTransition(CardStatus.BACKLOG, CardStatus.TODO)).toBe(true);
    });

    it('应该允许 TODO 到 IN_PROGRESS 的转换', () => {
      expect(canTransition(CardStatus.TODO, CardStatus.IN_PROGRESS)).toBe(true);
    });

    it('应该允许 TODO 回退到 BACKLOG', () => {
      expect(canTransition(CardStatus.TODO, CardStatus.BACKLOG)).toBe(true);
    });

    it('应该允许 IN_PROGRESS 到 REVIEW 的转换', () => {
      expect(canTransition(CardStatus.IN_PROGRESS, CardStatus.REVIEW)).toBe(true);
    });

    it('应该允许 REVIEW 到 DONE 的转换', () => {
      expect(canTransition(CardStatus.REVIEW, CardStatus.DONE)).toBe(true);
    });

    it('不应该允许 DONE 到其他状态的转换', () => {
      expect(canTransition(CardStatus.DONE, CardStatus.TODO)).toBe(false);
      expect(canTransition(CardStatus.DONE, CardStatus.IN_PROGRESS)).toBe(false);
    });

    it('不应该允许从同一个状态转换到同一个状态', () => {
      expect(canTransition(CardStatus.TODO, CardStatus.TODO)).toBe(false);
    });

    it('不应该允许不合法的转换路径', () => {
      // 例如：不能从 BACKLOG 直接跳到 IN_PROGRESS
      expect(canTransition(CardStatus.BACKLOG, CardStatus.IN_PROGRESS)).toBe(false);
      // 不能从 TODO 直接跳到 DONE
      expect(canTransition(CardStatus.TODO, CardStatus.DONE)).toBe(false);
      // 不能从 IN_PROGRESS 直接跳到 DONE
      expect(canTransition(CardStatus.IN_PROGRESS, CardStatus.DONE)).toBe(false);
    });

    it('处理无效的状态值', () => {
      expect(canTransition(null, CardStatus.TODO)).toBe(false);
      expect(canTransition(CardStatus.TODO, null)).toBe(false);
      expect(canTransition('invalid', CardStatus.TODO)).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('应该返回 BACKLOG 的有效转换', () => {
      const transitions = getValidTransitions(CardStatus.BACKLOG);
      expect(transitions).toEqual([CardStatus.TODO]);
    });

    it('应该返回 TODO 的有效转换', () => {
      const transitions = getValidTransitions(CardStatus.TODO);
      expect(transitions).toContain(CardStatus.IN_PROGRESS);
      expect(transitions).toContain(CardStatus.BACKLOG);
    });

    it('应该返回 DONE 的空转换列表', () => {
      const transitions = getValidTransitions(CardStatus.DONE);
      expect(transitions).toEqual([]);
    });

    it('处理无效状态', () => {
      expect(getValidTransitions(null)).toEqual([]);
      expect(getValidTransitions('invalid')).toEqual([]);
    });
  });

  describe('isFinalStatus', () => {
    it('应该识别 DONE 为最终状态', () => {
      expect(isFinalStatus(CardStatus.DONE)).toBe(true);
    });

    it('不应该识别其他状态为最终状态', () => {
      expect(isFinalStatus(CardStatus.BACKLOG)).toBe(false);
      expect(isFinalStatus(CardStatus.TODO)).toBe(false);
      expect(isFinalStatus(CardStatus.IN_PROGRESS)).toBe(false);
      expect(isFinalStatus(CardStatus.REVIEW)).toBe(false);
    });

    it('处理无效状态', () => {
      expect(isFinalStatus(null)).toBe(false);
      expect(isFinalStatus('invalid')).toBe(false);
    });
  });

  describe('getStatusDisplayName', () => {
    it('应该返回正确的中文显示名称', () => {
      expect(getStatusDisplayName(CardStatus.BACKLOG)).toBe('待规划');
      expect(getStatusDisplayName(CardStatus.TODO)).toBe('待办');
      expect(getStatusDisplayName(CardStatus.IN_PROGRESS)).toBe('进行中');
      expect(getStatusDisplayName(CardStatus.REVIEW)).toBe('审核中');
      expect(getStatusDisplayName(CardStatus.DONE)).toBe('已完成');
    });

    it('对于未知状态应该返回原始值', () => {
      expect(getStatusDisplayName('unknown')).toBe('unknown');
    });
  });
});

describe('WIP 限制测试', () => {
  describe('checkWIPLimit', () => {
    it('应该正确检查列的 WIP 限制', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.TODO, 
        wipLimit: 3 
      });
      
      const cards = [
        new Card({ id: '1', title: '卡片1', status: CardStatus.TODO }),
        new Card({ id: '2', title: '卡片2', status: CardStatus.TODO }),
        new Card({ id: '3', title: '卡片3', status: CardStatus.IN_PROGRESS }), // 不在此列
      ];
      
      const result = checkWIPLimit(column, cards);
      expect(result.currentCount).toBe(2);
      expect(result.limit).toBe(3);
      expect(result.allowed).toBe(true);
      expect(result.isExceeded).toBe(false);
    });

    it('应该检测 WIP 超限', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.TODO, 
        wipLimit: 2 
      });
      
      const cards = [
        new Card({ id: '1', title: '卡片1', status: CardStatus.TODO }),
        new Card({ id: '2', title: '卡片2', status: CardStatus.TODO }),
        new Card({ id: '3', title: '卡片3', status: CardStatus.TODO }),
      ];
      
      const result = checkWIPLimit(column, cards);
      expect(result.currentCount).toBe(3);
      expect(result.limit).toBe(2);
      expect(result.allowed).toBe(false);
      expect(result.isExceeded).toBe(true);
    });

    it('应该正确处理无限 WIP 限制', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.BACKLOG, 
        wipLimit: Infinity 
      });
      
      const cards = [
        new Card({ id: '1', title: '卡片1', status: CardStatus.BACKLOG }),
        new Card({ id: '2', title: '卡片2', status: CardStatus.BACKLOG }),
      ];
      
      const result = checkWIPLimit(column, cards);
      expect(result.currentCount).toBe(2);
      expect(result.limit).toBe(Infinity);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('依赖关系测试', () => {
  describe('checkDependencies', () => {
    it('没有依赖的卡片应该总是通过检查', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: [] 
      });
      
      const result = checkDependencies(card, []);
      expect(result.allowed).toBe(true);
    });

    it('依赖已完成卡片的应该通过检查', () => {
      const depCard = new Card({ 
        id: '2', 
        title: '依赖卡片', 
        status: CardStatus.DONE 
      });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['2'] 
      });
      
      const result = checkDependencies(card, [depCard]);
      expect(result.allowed).toBe(true);
    });

    it('依赖未完成卡片的应该不通过检查', () => {
      const depCard = new Card({ 
        id: '2', 
        title: '依赖卡片', 
        status: CardStatus.IN_PROGRESS 
      });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['2'] 
      });
      
      const result = checkDependencies(card, [depCard]);
      expect(result.allowed).toBe(false);
      expect(result.blockingCards).toEqual([depCard]);
      expect(result.reason).toContain('依赖卡片');
    });

    it('多个依赖中只要有一个未完成就不通过检查', () => {
      const depCard1 = new Card({ 
        id: '2', 
        title: '依赖卡片1', 
        status: CardStatus.DONE 
      });
      const depCard2 = new Card({ 
        id: '3', 
        title: '依赖卡片2', 
        status: CardStatus.IN_PROGRESS 
      });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['2', '3'] 
      });
      
      const result = checkDependencies(card, [depCard1, depCard2]);
      expect(result.allowed).toBe(false);
      expect(result.blockingCards).toEqual([depCard2]);
    });
  });

  describe('getDependentCards', () => {
    it('应该返回所有依赖指定卡片的卡片', () => {
      const card1 = new Card({ id: '1', title: '卡片1' });
      const card2 = new Card({ id: '2', title: '卡片2', dependencies: ['1'] });
      const card3 = new Card({ id: '3', title: '卡片3', dependencies: ['1'] });
      const card4 = new Card({ id: '4', title: '卡片4', dependencies: ['2'] });
      
      const dependentCards = getDependentCards('1', [card1, card2, card3, card4]);
      expect(dependentCards).toEqual([card2, card3]);
    });

    it('没有依赖的卡片应该返回空数组', () => {
      const card1 = new Card({ id: '1', title: '卡片1' });
      const card2 = new Card({ id: '2', title: '卡片2' });
      
      const dependentCards = getDependentCards('1', [card1, card2]);
      expect(dependentCards).toEqual([]);
    });
  });
});

describe('卡片移动测试', () => {
  describe('canMoveCardToColumn', () => {
    it('应该允许合法的状态转换且 WIP 未超限', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        status: CardStatus.BACKLOG 
      });
      
      const targetColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 5 
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        targetColumn
      ];
      
      const result = canMoveCardToColumn(card, targetColumn, [card], columns);
      expect(result.allowed).toBe(true);
    });

    it('不应该允许非法的状态转换', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        status: CardStatus.BACKLOG 
      });
      
      const targetColumn = new Column({ 
        id: 'col-in-progress', 
        name: '进行中', 
        status: CardStatus.IN_PROGRESS, 
        wipLimit: 5 
      });
      
      const columns = [targetColumn];
      
      const result = canMoveCardToColumn(card, targetColumn, [card], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('无法从');
    });

    it('不应该允许移动到 WIP 已满的列', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        status: CardStatus.BACKLOG 
      });
      
      const targetColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 2 
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        targetColumn
      ];
      
      // 目标列已经有2个卡片
      const allCards = [
        card,
        new Card({ id: '2', title: '卡片2', status: CardStatus.TODO }),
        new Card({ id: '3', title: '卡片3', status: CardStatus.TODO }),
      ];
      
      const result = canMoveCardToColumn(card, targetColumn, allCards, columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WIP 上限');
    });

    it('不应该允许移动有未完成依赖的卡片', () => {
      const depCard = new Card({ 
        id: '2', 
        title: '依赖卡片', 
        status: CardStatus.IN_PROGRESS 
      });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        status: CardStatus.BACKLOG,
        dependencies: ['2'] 
      });
      
      const targetColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 5 
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        targetColumn
      ];
      
      const result = canMoveCardToColumn(card, targetColumn, [card, depCard], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('依赖卡片');
    });

    it('应该处理无效的卡片或目标列', () => {
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
      ];
      
      // 无效的卡片
      let result = canMoveCardToColumn(null, columns[0], [], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('无效的卡片或目标列');
      
      // 无效的目标列
      const card = new Card({ id: '1', title: '测试卡片' });
      result = canMoveCardToColumn(card, null, [], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('无效的卡片或目标列');
    });
  });

  describe('getAvailableColumnsForCard', () => {
    it('应该返回所有列并标记哪些是有效目标', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        status: CardStatus.BACKLOG 
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        new Column({ id: 'col-todo', name: '待办', status: CardStatus.TODO, wipLimit: 5 }),
        new Column({ id: 'col-in-progress', name: '进行中', status: CardStatus.IN_PROGRESS, wipLimit: 3 }),
      ];
      
      const availableColumns = getAvailableColumnsForCard(card, columns, [card]);
      
      // BACKLOG 列：状态相同，不是有效目标
      const backlogCol = availableColumns.find(c => c.id === 'col-backlog');
      expect(backlogCol.isValidTarget).toBe(false);
      
      // TODO 列：是有效目标
      const todoCol = availableColumns.find(c => c.id === 'col-todo');
      expect(todoCol.isValidTarget).toBe(true);
      
      // IN_PROGRESS 列：不是有效目标（状态转换不合法）
      const inProgressCol = availableColumns.find(c => c.id === 'col-in-progress');
      expect(inProgressCol.isValidTarget).toBe(false);
    });
  });
});

describe('循环依赖检测测试', () => {
  describe('checkCircularDependency', () => {
    it('应该检测直接循环依赖（A 依赖 B，B 依赖 A）', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['b'] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
      const allCards = [cardA, cardB];
      
      // 检查：如果让 A 依赖 B，是否会形成循环？
      // 方法：检查从 B 出发，是否能到达 A
      const result = checkCircularDependency('b', 'a', allCards);
      expect(result.hasCircular).toBe(true);
      expect(result.path).toEqual(expect.arrayContaining(['b', 'a']));
    });

    it('应该检测间接循环依赖（A→B→C→A）', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['b'] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['c'] });
      const cardC = new Card({ id: 'c', title: '卡片C', status: CardStatus.TODO, dependencies: ['a'] });
      const allCards = [cardA, cardB, cardC];
      
      // 检查：如果让 A 依赖 B，是否会形成循环？
      const result = checkCircularDependency('b', 'a', allCards);
      expect(result.hasCircular).toBe(true);
    });

    it('不应该检测非循环依赖', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['b'] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['c'] });
      const cardC = new Card({ id: 'c', title: '卡片C', status: CardStatus.TODO, dependencies: [] });
      const allCards = [cardA, cardB, cardC];
      
      // 检查：如果让 A 依赖 B，是否会形成循环？
      // B 依赖 C，C 没有依赖，所以不会形成循环
      const result = checkCircularDependency('b', 'a', allCards);
      expect(result.hasCircular).toBe(false);
    });

    it('应该处理空依赖的情况', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: [] });
      const allCards = [cardA];
      
      const result = checkCircularDependency('a', 'b', allCards);
      expect(result.hasCircular).toBe(false);
    });

    it('应该处理不存在的卡片', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['nonexistent'] });
      const allCards = [cardA];
      
      const result = checkCircularDependency('a', 'b', allCards);
      expect(result.hasCircular).toBe(false);
    });
  });

  describe('canAddDependency', () => {
    it('不应该允许依赖自己', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      const allCards = [cardA];
      
      const result = canAddDependency('a', 'a', allCards);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('不能依赖自己');
    });

    it('不应该允许添加已存在的依赖', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['b'] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
      const allCards = [cardA, cardB];
      
      const result = canAddDependency('a', 'b', allCards);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('已经存在此依赖');
    });

    it('不应该允许会导致直接循环依赖的添加', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: [] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
      const allCards = [cardA, cardB];
      
      // 尝试让 A 依赖 B（已经 B 依赖 A，会形成循环）
      const result = canAddDependency('a', 'b', allCards);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('循环依赖');
    });

    it('不应该允许会导致间接循环依赖的添加', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: [] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
      const cardC = new Card({ id: 'c', title: '卡片C', status: CardStatus.TODO, dependencies: ['b'] });
      const allCards = [cardA, cardB, cardC];
      
      // 尝试让 A 依赖 C（C→B→A，会形成循环）
      const result = canAddDependency('a', 'c', allCards);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('循环依赖');
    });

    it('应该允许正常的依赖添加', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: [] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.DONE, dependencies: [] });
      const allCards = [cardA, cardB];
      
      // 让 A 依赖 B（B 没有依赖，不会形成循环）
      const result = canAddDependency('a', 'b', allCards);
      expect(result.allowed).toBe(true);
    });

    it('应该允许新卡片（无 ID）依赖任何卡片', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO, dependencies: ['b'] });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
      const allCards = [cardA, cardB];
      
      // 新卡片（null ID）应该可以依赖任何卡片，因为它还没有被其他卡片依赖
      const result = canAddDependency(null, 'a', allCards);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('边界情况测试', () => {
  describe('状态转换边界', () => {
    it('DONE 状态不应该允许任何转换', () => {
      const transitions = getValidTransitions(CardStatus.DONE);
      expect(transitions).toEqual([]);
    });

    it('BACKLOG 应该只允许转换到 TODO', () => {
      const transitions = getValidTransitions(CardStatus.BACKLOG);
      expect(transitions).toEqual([CardStatus.TODO]);
    });

    it('TODO 应该允许转换到 IN_PROGRESS 或回退到 BACKLOG', () => {
      const transitions = getValidTransitions(CardStatus.TODO);
      expect(transitions).toContain(CardStatus.IN_PROGRESS);
      expect(transitions).toContain(CardStatus.BACKLOG);
      expect(transitions.length).toBe(2);
    });

    it('REVIEW 应该允许转换到 DONE 或回退到 IN_PROGRESS', () => {
      const transitions = getValidTransitions(CardStatus.REVIEW);
      expect(transitions).toContain(CardStatus.DONE);
      expect(transitions).toContain(CardStatus.IN_PROGRESS);
      expect(transitions.length).toBe(2);
    });
  });

  describe('WIP 边界', () => {
    it('WIP 为 0 时不应该允许任何卡片', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.TODO, 
        wipLimit: 0 
      });
      
      const cards = [
        new Card({ id: '1', title: '卡片1', status: CardStatus.BACKLOG }),
      ];
      
      const result = checkWIPLimit(column, cards);
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('WIP 为 Infinity 时应该总是允许', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.BACKLOG, 
        wipLimit: Infinity 
      });
      
      const cards = Array.from({ length: 100 }, (_, i) => 
        new Card({ id: `card-${i}`, title: `卡片${i}`, status: CardStatus.BACKLOG })
      );
      
      const result = checkWIPLimit(column, cards);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(100);
      expect(result.limit).toBe(Infinity);
    });

    it('卡片数等于 WIP 限制时应该不允许', () => {
      const column = new Column({ 
        id: 'col-test', 
        name: '测试列', 
        status: CardStatus.TODO, 
        wipLimit: 2 
      });
      
      const cards = [
        new Card({ id: '1', title: '卡片1', status: CardStatus.TODO }),
        new Card({ id: '2', title: '卡片2', status: CardStatus.TODO }),
      ];
      
      const result = checkWIPLimit(column, cards);
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(2);
      expect(result.limit).toBe(2);
    });
  });

  describe('依赖关系边界', () => {
    it('依赖已完成的卡片不应该阻塞', () => {
      const depCard = new Card({ 
        id: '2', 
        title: '依赖卡片', 
        status: CardStatus.DONE 
      });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['2'] 
      });
      
      const result = checkDependencies(card, [depCard]);
      expect(result.allowed).toBe(true);
    });

    it('依赖不存在的卡片应该忽略', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['nonexistent'] 
      });
      
      const result = checkDependencies(card, []);
      expect(result.allowed).toBe(true);
    });

    it('多个依赖中部分完成部分未完成应该阻塞', () => {
      const doneCard = new Card({ id: '2', title: '已完成', status: CardStatus.DONE });
      const inProgressCard = new Card({ id: '3', title: '进行中', status: CardStatus.IN_PROGRESS });
      
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: ['2', '3'] 
      });
      
      const result = checkDependencies(card, [doneCard, inProgressCard]);
      expect(result.allowed).toBe(false);
      expect(result.blockingCards).toEqual([inProgressCard]);
    });

    it('空依赖列表应该总是通过', () => {
      const card = new Card({ 
        id: '1', 
        title: '测试卡片', 
        dependencies: [] 
      });
      
      const result = checkDependencies(card, []);
      expect(result.allowed).toBe(true);
    });

    it('null 依赖列表应该总是通过', () => {
      const card = {
        id: '1',
        title: '测试卡片',
        status: CardStatus.TODO,
        dependencies: null
      };
      
      // @ts-ignore - 测试 null 依赖的情况
      const result = checkDependencies(card, []);
      expect(result.allowed).toBe(true);
    });
  });

  describe('卡片移动综合测试', () => {
    it('应该综合检查状态转换、WIP 限制和依赖关系', () => {
      // 场景：卡片 A 依赖卡片 B，B 未完成
      // 目标列 WIP 已满
      // 状态转换合法
      
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.BACKLOG,
        dependencies: ['b']
      });
      
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.IN_PROGRESS  // 未完成
      });
      
      const todoColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 1 
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        todoColumn
      ];
      
      // 目标列已有 1 个卡片（达到 WIP 上限）
      const existingCards = [
        new Card({ id: 'c', title: '现有卡片', status: CardStatus.TODO })
      ];
      
      // 测试 1：依赖未完成 → 应该被拒绝
      let result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardB, ...existingCards], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('依赖卡片');
      
      // 测试 2：依赖完成，但 WIP 已满 → 应该被拒绝
      const cardBCompleted = { ...cardB, status: CardStatus.DONE };
      result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardBCompleted, ...existingCards], columns);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WIP 上限');
      
      // 测试 3：依赖完成且 WIP 未满 → 应该允许
      result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardBCompleted], columns);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('移动校验顺序与提示语义测试', () => {
  describe('检查顺序验证', () => {
    it('应该优先检查依赖关系，再检查 WIP 限制', () => {
      // 场景：卡片有未完成的依赖，同时目标列 WIP 已满
      // 期望：应该返回依赖关系错误，而不是 WIP 错误
      
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.BACKLOG,
        dependencies: ['b']
      });
      
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.IN_PROGRESS  // 未完成
      });
      
      const todoColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 0  // WIP 为 0，已满
      });
      
      const columns = [todoColumn];
      
      const result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardB], columns);
      
      // 应该优先返回依赖关系错误，而不是 WIP 错误
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('dependency_blocked');
      expect(result.reason).toContain('依赖卡片');
      expect(result.reason).not.toContain('WIP');
    });

    it('当依赖关系通过后，应该检查 WIP 限制', () => {
      // 场景：依赖已完成，但目标列 WIP 已满
      
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.BACKLOG,
        dependencies: ['b']
      });
      
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.DONE  // 已完成
      });
      
      const todoColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 0  // WIP 为 0，已满
      });
      
      const columns = [todoColumn];
      
      const result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardB], columns);
      
      // 应该返回 WIP 错误
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('wip_exceeded');
      expect(result.reason).toContain('WIP 上限');
    });
  });

  describe('提示语义与 type 字段', () => {
    it('应该返回正确的 type 字段', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.BACKLOG
      });
      
      const columns = [
        new Column({ id: 'col-backlog', name: '待规划', status: CardStatus.BACKLOG, wipLimit: Infinity }),
        new Column({ id: 'col-todo', name: '待办', status: CardStatus.TODO, wipLimit: 5 }),
        new Column({ id: 'col-in-progress', name: '进行中', status: CardStatus.IN_PROGRESS, wipLimit: 3 }),
      ];
      
      // 测试 1：无效的状态转换
      let result = canMoveCardToColumn(cardA, columns[2], [cardA], columns);
      expect(result.type).toBe('invalid_transition');
      
      // 测试 2：允许的移动
      result = canMoveCardToColumn(cardA, columns[1], [cardA], columns);
      expect(result.type).toBe('allowed');
      expect(result.allowed).toBe(true);
    });

    it('依赖阻塞时应该返回 blockingCards', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.BACKLOG,
        dependencies: ['b', 'c']
      });
      
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.IN_PROGRESS  // 未完成
      });
      
      const cardC = new Card({ 
        id: 'c', 
        title: '卡片C', 
        status: CardStatus.DONE  // 已完成
      });
      
      const todoColumn = new Column({ 
        id: 'col-todo', 
        name: '待办', 
        status: CardStatus.TODO, 
        wipLimit: 5
      });
      
      const result = canMoveCardToColumn(cardA, todoColumn, [cardA, cardB, cardC], [todoColumn]);
      
      expect(result.type).toBe('dependency_blocked');
      expect(result.blockingCards).toBeDefined();
      expect(result.blockingCards.length).toBe(1);
      expect(result.blockingCards[0].id).toBe('b');
    });
  });
});

describe('getAvailableDependencies 测试', () => {
  it('新建卡片时应该返回统一格式的结果', () => {
    const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
    const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
    const allCards = [cardA, cardB];
    
    // 新建卡片（cardId 为 undefined）
    const result = getAvailableDependencies(undefined, allCards);
    
    expect(result.length).toBe(2);
    
    // 每个结果都应该有 isAvailable 和 unavailableReason 字段
    result.forEach(item => {
      expect(item.isAvailable).toBeDefined();
      expect(item.unavailableReason).toBeDefined();
    });
    
    // 对于新建卡片，所有卡片都应该是可用的
    result.forEach(item => {
      expect(item.isAvailable).toBe(true);
    });
  });

  it('编辑卡片时应该正确标记不可用的依赖', () => {
    // 创建循环依赖：A 依赖 B，B 依赖 A
    const cardA = new Card({ 
      id: 'a', 
      title: '卡片A', 
      status: CardStatus.TODO,
      dependencies: ['b']
    });
    const cardB = new Card({ 
      id: 'b', 
      title: '卡片B', 
      status: CardStatus.TODO,
      dependencies: ['a']
    });
    const cardC = new Card({ 
      id: 'c', 
      title: '卡片C', 
      status: CardStatus.TODO
    });
    
    const allCards = [cardA, cardB, cardC];
    
    // 编辑卡片 A，检查可用的依赖
    const result = getAvailableDependencies('a', allCards);
    
    // 卡片 A 不能依赖自己
    const itemA = result.find(r => r.id === 'a');
    expect(itemA.isAvailable).toBe(false);
    expect(itemA.unavailableReason).toContain('不能依赖自己');
    
    // 卡片 A 不能依赖 B（因为 B 依赖 A，形成循环）
    const itemB = result.find(r => r.id === 'b');
    expect(itemB.isAvailable).toBe(false);
    expect(itemB.unavailableReason).toContain('循环依赖');
    
    // 卡片 A 可以依赖 C
    const itemC = result.find(r => r.id === 'c');
    expect(itemC.isAvailable).toBe(true);
  });

  it('应该正确处理空卡片列表', () => {
    const result = getAvailableDependencies('a', []);
    expect(result).toEqual([]);
  });

  it('应该正确处理 null 卡片列表', () => {
    // @ts-ignore - 测试 null 情况
    const result = getAvailableDependencies('a', null);
    expect(result).toEqual([]);
  });
});

describe('回归测试', () => {
  describe('canAddDependency 边界情况', () => {
    it('新建卡片时 canAddDependency 应该总是允许', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
      
      // 新建卡片（cardId 为 undefined）想要依赖 B
      // 即使 B 依赖 A，也应该允许，因为新卡片还没有被任何卡片依赖
      const result = canAddDependency(undefined, 'b', [cardA, cardB]);
      
      expect(result.allowed).toBe(true);
    });

    it('应该正确检测已存在的依赖', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
      
      // 卡片 A 尝试再次依赖 B
      const result = canAddDependency('a', 'b', [cardA, cardB]);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('已经存在此依赖');
    });
  });

  describe('checkCircularDependency 边界情况', () => {
    it('应该正确检测自身循环（卡片依赖自己）', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['a']  // 依赖自己
      });
      
      // 检查从 a 出发能否到达 a
      const result = checkCircularDependency('a', 'a', [cardA]);
      
      expect(result.hasCircular).toBe(true);
    });

    it('应该正确处理不存在的卡片', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      
      // 检查从不存在的卡片出发
      const result = checkCircularDependency('nonexistent', 'a', [cardA]);
      
      expect(result.hasCircular).toBe(false);
    });

    it('应该正确处理目标卡片不存在的情况', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
      
      // 检查从 a 出发能否到达不存在的卡片
      const result = checkCircularDependency('a', 'nonexistent', [cardA, cardB]);
      
      expect(result.hasCircular).toBe(false);
    });
  });
});

describe('统一依赖规则测试', () => {
  describe('DependencyCheckType 枚举', () => {
    it('应该定义所有依赖检查类型', () => {
      expect(DependencyCheckType.SELF_DEPENDENCY).toBe('self_dependency');
      expect(DependencyCheckType.DUPLICATE_DEPENDENCY).toBe('duplicate_dependency');
      expect(DependencyCheckType.CIRCULAR_DEPENDENCY).toBe('circular_dependency');
      expect(DependencyCheckType.EXISTING_CIRCULAR).toBe('existing_circular');
      expect(DependencyCheckType.VALID).toBe('valid');
    });
  });

  describe('checkMultiDependencyCircular', () => {
    it('应该检测选中的依赖项之间存在循环', () => {
      // 场景：用户选择 A 和 B 作为依赖，但 A 依赖 B，B 依赖 A
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.TODO,
        dependencies: ['a']
      });
      const cardC = new Card({ 
        id: 'c', 
        title: '卡片C', 
        status: CardStatus.TODO
      });
      
      // 用户选择 A、B、C 作为依赖
      const result = checkMultiDependencyCircular(['a', 'b', 'c'], [cardA, cardB, cardC]);
      
      expect(result.hasCircular).toBe(true);
      expect(result.type).toBe(DependencyCheckType.CIRCULAR_DEPENDENCY);
      expect(result.reason).toContain('选中的依赖项之间存在循环');
    });

    it('不应该检测非循环的依赖项', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.TODO,
        dependencies: ['c']
      });
      const cardC = new Card({ 
        id: 'c', 
        title: '卡片C', 
        status: CardStatus.TODO
      });
      
      // 用户选择 A、B、C 作为依赖（A→B→C，没有循环）
      const result = checkMultiDependencyCircular(['a', 'b', 'c'], [cardA, cardB, cardC]);
      
      expect(result.hasCircular).toBe(false);
    });

    it('单依赖或无依赖时应该总是通过', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      
      // 无依赖
      let result = checkMultiDependencyCircular([], [cardA]);
      expect(result.hasCircular).toBe(false);
      
      // null 或 undefined
      result = checkMultiDependencyCircular(null, [cardA]);
      expect(result.hasCircular).toBe(false);
      
      // 单依赖
      result = checkMultiDependencyCircular(['a'], [cardA]);
      expect(result.hasCircular).toBe(false);
    });
  });

  describe('checkExistingCircular', () => {
    it('应该检测依赖项本身存在循环', () => {
      // 场景：用户选择 B 作为依赖，但 B 已经和 C 形成循环
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.TODO,
        dependencies: ['c']
      });
      const cardC = new Card({ 
        id: 'c', 
        title: '卡片C', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      
      const result = checkExistingCircular('b', [cardB, cardC]);
      
      expect(result.hasCircular).toBe(true);
      expect(result.type).toBe(DependencyCheckType.EXISTING_CIRCULAR);
      expect(result.reason).toContain('本身存在循环依赖');
    });

    it('不应该检测不存在循环的依赖项', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.TODO
      });
      
      const result = checkExistingCircular('a', [cardA, cardB]);
      
      expect(result.hasCircular).toBe(false);
    });

    it('应该正确处理不存在的卡片', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      
      const result = checkExistingCircular('nonexistent', [cardA]);
      
      expect(result.hasCircular).toBe(false);
    });
  });

  describe('validateDependencies - 统一验证函数', () => {
    describe('检查优先级验证', () => {
      it('应该优先检测依赖自己（最高优先级）', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        
        // 场景：用户选择自己作为依赖
        const result = validateDependencies('a', ['a', 'b', 'c'], [cardA]);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe(DependencyCheckType.SELF_DEPENDENCY);
        expect(result.reason).toContain('不能依赖自己');
      });

      it('应该其次检测重复依赖', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
        
        // 场景：用户重复选择 B 作为依赖
        const result = validateDependencies('a', ['b', 'b'], [cardA, cardB]);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe(DependencyCheckType.DUPLICATE_DEPENDENCY);
        expect(result.reason).toContain('存在重复依赖');
      });

      it('应该然后检测选中依赖项之间的循环', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['c'] });
        const cardC = new Card({ id: 'c', title: '卡片C', status: CardStatus.TODO, dependencies: ['b'] });
        
        // 场景：用户选择 B 和 C 作为依赖（B 和 C 之间有循环）
        const result = validateDependencies('a', ['b', 'c'], [cardA, cardB, cardC]);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe(DependencyCheckType.CIRCULAR_DEPENDENCY);
        expect(result.reason).toContain('选中的依赖项之间存在循环');
      });

      it('应该最后检测与现有卡片的循环（编辑模式）', () => {
        // 场景：卡片 B 依赖卡片 A
        // 用户尝试让卡片 A 依赖卡片 B（形成循环）
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
        
        // 编辑模式：用户尝试让 A 依赖 B
        const result = validateDependencies('a', ['b'], [cardA, cardB]);
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('循环依赖');
      });
    });

    describe('新建场景 vs 编辑场景', () => {
      it('新建场景下不检测与现有卡片的循环', () => {
        // 场景：卡片 B 依赖卡片 A
        // 用户新建卡片时选择 B 作为依赖
        // 这是允许的，因为新卡片还没有被任何卡片依赖
        
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
        
        // 新建模式（cardId 为 undefined）
        const result = validateDependencies(undefined, ['b'], [cardA, cardB]);
        
        expect(result.allowed).toBe(true);
        expect(result.type).toBe(DependencyCheckType.VALID);
      });

      it('编辑场景下检测与现有卡片的循环', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO, dependencies: ['a'] });
        
        // 编辑模式：用户尝试让 A 依赖 B
        const result = validateDependencies('a', ['b'], [cardA, cardB]);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('边界情况', () => {
      it('空依赖列表应该总是通过', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        
        // 编辑模式，空依赖
        let result = validateDependencies('a', [], [cardA]);
        expect(result.allowed).toBe(true);
        expect(result.type).toBe(DependencyCheckType.VALID);
        
        // 新建模式，空依赖
        result = validateDependencies(undefined, [], [cardA]);
        expect(result.allowed).toBe(true);
        expect(result.type).toBe(DependencyCheckType.VALID);
      });

      it('null 依赖列表应该总是通过', () => {
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        
        // @ts-ignore - 测试 null 情况
        const result = validateDependencies('a', null, [cardA]);
        expect(result.allowed).toBe(true);
      });

      it('应该检测已存在的依赖（编辑模式）', () => {
        const cardA = new Card({ 
          id: 'a', 
          title: '卡片A', 
          status: CardStatus.TODO,
          dependencies: ['b']  // 已经依赖 B
        });
        const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
        
        // 用户尝试再次添加 B 作为依赖
        const result = validateDependencies('a', ['b'], [cardA, cardB]);
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('已经存在此依赖');
      });
    });

    describe('警告检测（依赖项本身存在循环）', () => {
      it('应该检测依赖项本身存在循环并返回警告', () => {
        // 场景：用户选择 B 作为依赖，但 B 已经和 C 形成循环
        // 这是警告级别，不是错误级别
        const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
        const cardB = new Card({ 
          id: 'b', 
          title: '卡片B', 
          status: CardStatus.TODO,
          dependencies: ['c']
        });
        const cardC = new Card({ 
          id: 'c', 
          title: '卡片C', 
          status: CardStatus.TODO,
          dependencies: ['b']
        });
        
        const result = validateDependencies('a', ['b'], [cardA, cardB, cardC]);
        
        // 应该允许，但有警告
        expect(result.allowed).toBe(true);
        expect(result.isWarning).toBe(true);
        expect(result.type).toBe(DependencyCheckType.EXISTING_CIRCULAR);
        expect(result.warning).toContain('本身存在循环依赖');
      });
    });
  });

  describe('提示文案一致性', () => {
    it('依赖自己的提示文案应该一致', () => {
      const cardA = new Card({ id: 'a', title: '卡片A', status: CardStatus.TODO });
      
      // 从 getAvailableDependencies 获取
      const availableDeps = getAvailableDependencies('a', [cardA]);
      const selfCard = availableDeps.find(d => d.id === 'a');
      
      // 从 validateDependencies 获取
      const validateResult = validateDependencies('a', ['a'], [cardA]);
      
      // 两者的提示文案应该一致
      expect(selfCard.unavailableReason).toContain('不能依赖自己');
      expect(validateResult.reason).toContain('不能依赖自己');
    });

    it('已存在依赖的提示文案应该一致', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ id: 'b', title: '卡片B', status: CardStatus.TODO });
      
      // 从 canAddDependency 获取
      const addResult = canAddDependency('a', 'b', [cardA, cardB]);
      
      // 从 validateDependencies 获取
      const validateResult = validateDependencies('a', ['b'], [cardA, cardB]);
      
      // 两者的提示文案应该一致
      expect(addResult.reason).toContain('已经存在此依赖');
      expect(validateResult.reason).toContain('已经存在此依赖');
    });

    it('循环依赖的提示文案应该包含路径', () => {
      const cardA = new Card({ 
        id: 'a', 
        title: '卡片A', 
        status: CardStatus.TODO,
        dependencies: ['b']
      });
      const cardB = new Card({ 
        id: 'b', 
        title: '卡片B', 
        status: CardStatus.TODO,
        dependencies: ['a']
      });
      
      const result = validateDependencies('a', ['b'], [cardA, cardB]);
      
      // 应该包含卡片标题的循环路径
      expect(result.reason).toContain('循环依赖');
      expect(result.reason).toContain('卡片A');
      expect(result.reason).toContain('卡片B');
    });
  });
});
