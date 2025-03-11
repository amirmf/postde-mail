import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MailService } from './mail.service';
import * as fs from 'fs';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { FormioSubmitDto } from './formio.dto';


@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) { }


  @Post('handle-submission')
  async formioWebhook(@Body() dto_: FormioSubmitDto) {
    const id = dto_.submission._id;
    const dt:any = await this.getFormData(id);
    const dto = {submission:dt.data};

    const submit_day = dt.created.split('T')[0];//#

    const counter = await this.mailService.increaseAdnGetCounter(submit_day);
    await this.mailService.storeDB();
    const invoiceId = ((submit_day.split('-')[2] + submit_day.split('-')[1] + submit_day.split('-')[0]))+'-'+ counter.toString().padStart(5, '0'); 
    dto.submission.invoiceID = invoiceId;
    await this.updateFormData(id, dto.submission);
    await this.sendMailSubmissionFirst(id);
    this.sendMailSubmissionSecond(id);
  }
  @Get('handle-submission')
  async formioWebhook2(@Query('id') id) {
    const dt:any = await this.getFormData(id);
    const dto = {submission:dt.data};

    const submit_day = dt.created.split('T')[0];//#

    const counter = await this.mailService.increaseAdnGetCounter(submit_day);
    await this.mailService.storeDB();
    const invoiceId = ((submit_day.split('-')[2] + submit_day.split('-')[1] + submit_day.split('-')[0]))+'-'+ counter.toString().padStart(5, '0'); 
    dto.submission.invoiceID = invoiceId;
    await this.updateFormData(id, dto.submission);
    await this.sendMailSubmissionFirst(id);
    this.sendMailSubmissionSecond(id);
  }

  async sendMailSubmissionFirst(id) {
    const data: any = await this.getFormData(id);
    const to = data.data.eMailAdresse1 ?? data.data.eMailAdresse;
    // const to = "amf.fard@gmail.com";
    // const to = "nimagekko@gmail.com";
    const name = data.data.firmenname ?? (data.data.vorname + ' ' + data.data.nachname);
    const addr = data.data.nummer + ' ' + data.data.strasse + ' ' + data.data.ort;
    const zip = data.data.plz;
    const startDate = data.data.spatererStartzeitpunkt;
    const orderDate = data.created.split('T')[0];
    const price = data.data.artDerNachsendung == 'privat' ? '119,90 EURO' : '129,90 EURO';
    const invoiceId = data.data.invoiceID;

    let html = fs.readFileSync(__dirname + '/../../templates/pdf/invoice.html', 'utf8');
    html = html
      .replaceAll('{{name}}', name)
      .replaceAll('{{addr}}', addr)
      .replaceAll('{{zip}}', zip)
      .replaceAll('{{date1}}', orderDate)
      .replaceAll('{{date2}}', orderDate)
      .replaceAll('{{price}}', price)
      .replaceAll('{{invoiceId}}', invoiceId);


    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const PDF_PATH = process.env.PDF_PATH ?? (__dirname + `/../../templates/pdf`);
    const INVOICE_PATH = `${PDF_PATH}/Rechnung-${invoiceId}.pdf`;
    await page.pdf({ path: INVOICE_PATH });
    await browser.close();

    await this.mailService.sendEmail({
      subject: 'Nachsendeauftrag für Ihre Post',
      template: './submission-first',
      to: to,
      context: {
        name: name,
        startDate: startDate,
      },
      attachments: [
        {
          filename: 'Widerrufsbelehrung und Muster-Widerrufsformular.pdf',
          path: 'https://nachsendeauftrag-buchen.de/W.pdf',
          contentType: "application/pdf",
        },
        {
          filename: 'Datenschutzerklärung.pdf',
          path: 'https://nachsendeauftrag-buchen.de/D.pdf',
          contentType: "application/pdf",
        },
        {
          filename: 'Allgemeine Geschäftsbedingungen.pdf',
          path: 'https://nachsendeauftrag-buchen.de/A.pdf',
          contentType: "application/pdf",
        },
        {
          filename: 'Ihre Checkliste für einen reibungslosen Umzug.pdf',
          path: 'https://nachsendeauftrag-buchen.de/I.pdf',
          contentType: "application/pdf",
        },
        {
          filename: `Rechnung-${invoiceId}.pdf`,
          path: INVOICE_PATH,
          contentType: "application/pdf",
        },
      ],
    });
  }

  async sendMailSubmissionSecond(id) {
    await new Promise(r => setTimeout(r, 2*60*1000));
    const data: any = await this.getFormData(id);
    const to = data.data.eMailAdresse1 ?? data.data.eMailAdresse;
    // const to = "amf.fard@gmail.com";
    // const to = "nimagekko@gmail.com";
    const name = data.data.firmenname ?? (data.data.vorname + ' ' + data.data.nachname);
    const addr = data.data.nummer + ' ' + data.data.strasse + ' ' + data.data.ort;
    const orderDate = data.created.split('T')[0];
    const price = data.data.artDerNachsendung == 'privat' ? '119,90 EURO' : '129,90 EURO';

    const oldStreatNum = data.data.strasse + ' ' + data.data.nummer;
    const oldZipCode = data.data.plz;
    const oldCity = data.data.ort;

    const streatNum = data.data.strasse1 + ' ' + data.data.nummer1;
    const zipCode = data.data.plz1;
    const city = data.data.ort1;

    const ip = data.metadata.headers['x-real-ip'];

    const invoiceId = data.data.invoiceID;

    let html = fs.readFileSync(__dirname + '/../../templates/pdf/pow.html', 'utf8');
    html = html
      .replaceAll('{{name}}', name)
      .replaceAll('{{ip}}', ip)
      .replaceAll('{{email}}', to)

      .replaceAll('{{oldStreatNum}}', oldStreatNum)
      .replaceAll('{{oldZipCode}}', oldZipCode)
      .replaceAll('{{oldCity}}', oldCity)

      .replaceAll('{{streatNum}}', streatNum)
      .replaceAll('{{zipCode}}', zipCode)
      .replaceAll('{{city}}', city)

      .replaceAll('{{addr}}', addr)
      .replaceAll('{{date1}}', orderDate)
      .replaceAll('{{date2}}', orderDate)
      .replaceAll('{{price}}', price)
      .replaceAll('{{invoiceId}}', invoiceId);


    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const PDF_PATH = process.env.PDF_PATH ?? (__dirname + `/../../templates/pdf`);
    const INVOICE_PATH = `${PDF_PATH}/Leistungsnachweis-zur-Rechnung-${invoiceId}.pdf`;
    await page.pdf({ path: INVOICE_PATH });
    await browser.close();

    await this.mailService.sendEmail({
      subject: 'Leistungsnachweis für Ihren Nachsendeauftrag',
      template: './submission-second',
      to: to,
      context: {
        name: name,
        price: price,
        invoiceId: invoiceId,
      },
      attachments: [
        {
          filename: `Leistungsnachweis zur Rechnung-${invoiceId}.pdf`,
          path: INVOICE_PATH,
          contentType: "application/pdf",
        },
      ],
    });
  }

  async getFormData(id: string) {
    const FORMIO_HOST = process.env.FORMIO_HOST ?? 'https://formio.ostaadx.ai';
    const subm = { data: {} };
    try {
      const response = await axios.get(`${FORMIO_HOST}/postnachsendeauftrag/submission/${id}`);
      if (response.status == 200)
        subm.data = response.data;
    } catch (error) {
      console.error(error);
    }
    return subm.data;
  }
  
  async updateFormData(id: string, data:any) {
    const FORMIO_HOST = process.env.FORMIO_HOST ?? 'https://formio.ostaadx.ai';
    try {
      const response = await axios.put(`${FORMIO_HOST}/postnachsendeauftrag/submission/${id}`, {data:data});
      if (response.status == 200)
        console.log('successfully updated');
    } catch (error) {
      console.error(error);
    }
  }
}
