// 卡片状态
export const CardStatus = {
  BACKLOG: 'backlog',
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
};

// 卡片模型
export class Card {
  constructor({ id, title, description, status, dependencies = [], createdAt, updatedAt }) {
    this.id = id;
    this.title = title;
    this.description = description || '';
    this.status = status || CardStatus.BACKLOG;
    this.dependencies = dependencies;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }
}

// 列模型
export class Column {
  constructor({ id, name, status, wipLimit = Infinity, order }) {
    this.id = id;
    this.name = name;
    this.status = status; // 对应 CardStatus 中的值
    this.wipLimit = wipLimit;
    this.order = order;
  }
}

// 状态机配置
export const StateMachineConfig = {
  [CardStatus.BACKLOG]: {
    transitions: [CardStatus.TODO],
    isFinal: false,
  },
  [CardStatus.TODO]: {
    transitions: [CardStatus.IN_PROGRESS, CardStatus.BACKLOG],
    isFinal: false,
  },
  [CardStatus.IN_PROGRESS]: {
    transitions: [CardStatus.REVIEW, CardStatus.TODO],
    isFinal: false,
  },
  [CardStatus.REVIEW]: {
    transitions: [CardStatus.DONE, CardStatus.IN_PROGRESS],
    isFinal: false,
  },
  [CardStatus.DONE]: {
    transitions: [],
    isFinal: true,
  },
};
