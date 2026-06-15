export const ActorType = {
  USER: 'USER',
  AGENT: 'AGENT',
  SYSTEM: 'SYSTEM',
} as const;

export type ActorType = (typeof ActorType)[keyof typeof ActorType];
