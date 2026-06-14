import { RouterAgent } from './router.agent';

describe('RouterAgent', () => {
  const agent = new RouterAgent();

  it('classifies billing tickets correctly', () => {
    const output = agent.route({
      subject: 'Invoice issue',
      body: 'My payment card was charged twice on billing.',
    });

    expect(output.category).toBe('billing');
  });

  it('classifies technical tickets correctly', () => {
    const output = agent.route({
      subject: 'API error',
      body: 'The API is not working and returns an error.',
    });

    expect(output.category).toBe('technical');
  });
});
