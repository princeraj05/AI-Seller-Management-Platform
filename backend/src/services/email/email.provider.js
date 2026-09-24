export class BaseEmailProvider {
  constructor(name) {
    this.name = name;
  }

  async sendEmail(to, subject, htmlBody) {
    throw new Error(`sendEmail not implemented for provider ${this.name}`);
  }
}
