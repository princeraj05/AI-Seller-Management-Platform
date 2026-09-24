export class BaseAiProvider {
  constructor(name) {
    this.name = name;
  }

  async generateInsights(contextData) {
    throw new Error(`generateInsights not implemented for ${this.name}`);
  }

  async generateRecommendations(contextData) {
    throw new Error(`generateRecommendations not implemented for ${this.name}`);
  }

  async answerQuestion(question, contextData) {
    throw new Error(`answerQuestion not implemented for ${this.name}`);
  }
}
