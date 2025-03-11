import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { Attachment } from 'nodemailer/lib/mailer';
import * as fs from 'fs';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private dbInvoice:any;

  constructor(private readonly mailerService: MailerService) {
    const DB_PATH = process.env.DB_PATH ?? (__dirname + `/../../db`);
    let dbInvoice = fs.readFileSync((DB_PATH + '/invoice.json'), 'utf8');
    dbInvoice = JSON.parse(dbInvoice);
    this.dbInvoice = dbInvoice;
  }

  async storeDB() {
    const DB_PATH = process.env.DB_PATH ?? (__dirname + `/../../db`);
    fs.writeFileSync(DB_PATH + '/invoice.json',JSON.stringify(this.dbInvoice));
  }

  async increaseAdnGetCounter(date:string) {
    const lastCounter = parseInt(this.dbInvoice[date]?.toString() ?? '0');
    this.dbInvoice[date] = lastCounter+1;
    return this.dbInvoice[date];
  }
  async getCounter(date:string) {
    const lastCounter = parseInt(this.dbInvoice[date]?.toString() ?? '0');
    return lastCounter;
  }
  async sendEmail(params: {
    subject: string;
    template: string;
    to: string;
    context: ISendMailOptions['context'];
    attachments: Attachment[];
  }) {
    try {
      const emailsList: string[] = params.to?.split(',');

      if (!emailsList) 
        throw new Error(`No recipients found in to param`,);
      
      const sendMailParams = {
        to: emailsList,
        from: process.env.SMTP_FROM,
        subject: params.subject,
        template: params.template,
        context: params.context,
        attachments: params.attachments,
      };
      const response = await this.mailerService.sendMail(sendMailParams);

    } catch (error) {
      this.logger.error(
        `Error while sending mail with the following parameters : ${JSON.stringify(
          params,
        )}`,
        error,
      );
    }
  }
}
