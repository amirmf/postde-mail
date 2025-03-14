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
    await this.formioWebhook2(id);
  }

  @Get('update-validate-addr')
  async validateAddr(@Query('id') id) {
    const dt: any = await this.getFormData(id);
    const dto = { submission: dt.data };

    const addr = + dto.submission.nummer+(dto.submission.adresszusatz ? (', '+dto.submission.adresszusatz) : '')+ ', ' +dto.submission.strasse + ', ' + dto.submission.ort+", Germany";
    const addr1 = + dto.submission.nummer1+(dto.submission.adresszusatz1 ? (', '+dto.submission.adresszusatz1) : '')+ ', ' +dto.submission.strasse1 + ', ' + dto.submission.ort1+", Germany";
    const validAddr = await this.mailService.validateAddr(dto.submission.plz,addr);
    const validAddr1 = await this.mailService.validateAddr(dto.submission.plz1,addr1);
    if(!!validAddr) dto.submission.validAddrOld = validAddr+"";
    if(!!validAddr1) dto.submission.validAddrNew = validAddr1+"";

    await this.updateFormData(id, dto.submission);
  }

  @Get('handle-submission')
  async formioWebhook2(@Query('id') id) {
    const dt: any = await this.getFormData(id);
    const dto = { submission: dt.data };

    const submit_day = dt.created.split('T')[0];

    const counter = await this.mailService.increaseAdnGetCounter(submit_day);
    await this.mailService.storeDB();
    const invoiceId = ((submit_day.split('-')[2] + submit_day.split('-')[1] + submit_day.split('-')[0])) + '-' + counter.toString().padStart(5, '0');
    dto.submission.invoiceID = invoiceId;

    const submit_day_formatted = submit_day.split('-')[2] + '.' + submit_day.split('-')[1] + '.' + submit_day.split('-')[0];
    let theDate = new Date();
    let theDate2 = new Date();
    theDate2.setMinutes(theDate.getMinutes() + 2);
    const date1 = submit_day_formatted + ' ' + theDate.toLocaleString("en-GB", { timeZone: "Europe/Berlin" }).split(', ')[1];
    const date2 = submit_day_formatted + ' ' + theDate2.toLocaleString("en-GB", { timeZone: "Europe/Berlin" }).split(', ')[1];
    dto.submission.date1 = date1.slice(0,-3);
    dto.submission.date2 = date2.slice(0,-3);

    const addr = + dto.submission.nummer+(dto.submission.adresszusatz ? (', '+dto.submission.adresszusatz) : '')+ ', ' +dto.submission.strasse + ', ' + dto.submission.ort+", Germany";
    const addr1 = + dto.submission.nummer1+(dto.submission.adresszusatz1 ? (', '+dto.submission.adresszusatz1) : '')+ ', ' +dto.submission.strasse1 + ', ' + dto.submission.ort1+", Germany";
    const validAddr = await this.mailService.validateAddr(dto.submission.plz,addr);
    const validAddr1 = await this.mailService.validateAddr(dto.submission.plz1,addr1);
    if(!!validAddr) dto.submission.validAddrOld = validAddr+"";
    if(!!validAddr1) dto.submission.validAddrNew = validAddr1+"";

    await this.updateFormData(id, dto.submission);
    await this.sendMailSubmissionFirst(id);
    this.sendMailSubmissionSecond(id);
  }

  async sendMailSubmissionFirst(id) {
    const data: any = await this.getFormData(id);
    const to = data.data.eMailAdresse1 ?? data.data.eMailAdresse;
    const name = data.data.firmenname ?? (data.data.vorname + ' ' + data.data.nachname);
    const addrfull = data.data.adresszusatz ?? '';
    const addr = data.data.strasse + ' ' + data.data.nummer;
    const zip = data.data.plz + ' ' + data.data.ort;
    let startDate = data.data.spatererStartzeitpunkt;
    if(startDate.indexOf('-')!=-1) startDate=startDate.split('-')[2] + '.' + startDate.split('-')[1] + '.' + startDate.split('-')[0];
    let orderDate = data.created.split('T')[0];
    orderDate = orderDate.split('-')[2] + '.' + orderDate.split('-')[1] + '.' + orderDate.split('-')[0];
    let price = '0';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="6m") price = '107,94 EURO';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="12m") price = '119,88 EURO';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="6m") price = '117,78 EURO';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="12m") price = '131,88 EURO';

    let month = '6';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="12m") month = '12';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="6m") month = '6';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="12m") month = '12';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="6m") month = '6';
      
    const invoiceId = data.data.invoiceID;

    let html = fs.readFileSync(__dirname + '/../../templates/pdf/invoice.html', 'utf8');
    html = html
      .replaceAll('{{name}}', name)
      .replaceAll('{{addr}}', addr)
      .replaceAll('{{addrfull}}', addrfull)
      .replaceAll('{{zip}}', zip)
      .replaceAll('{{date1}}', orderDate)
      .replaceAll('{{date2}}', orderDate)
      .replaceAll('{{month}}', month )
      .replaceAll('{{price}}', price)
      .replaceAll('{{invoiceId}}', invoiceId)
      .replaceAll('{{art}}', data.data.artDerNachsendung == 'privat' ? 'privaten' : 'gewerblichen');


    const browser = await puppeteer.launch(
      {
        args: ['--no-sandbox']
      }
    );
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
    await this.mailService.sendEmail({
      subject: 'New Client',
      template: './submission-first',
      to: 'nimagekko@gmail.com',
      context: {
        name: name,
        startDate: startDate,
      },
      attachments: []
    });
  }

  async sendMailSubmissionSecond(id) {
    await new Promise(r => setTimeout(r, 2*60*1000));
    const data: any = await this.getFormData(id);
    const to = data.data.eMailAdresse1 ?? data.data.eMailAdresse;
    const name = data.data.firmenname ?? (data.data.vorname + ' ' + data.data.nachname);
    const addr = data.data.strasse + ' ' + data.data.nummer;
    const zip = data.data.plz + ' ' + data.data.ort;

    let orderDate = data.created.split('T')[0];
    orderDate = orderDate.split('-')[2] + '.' + orderDate.split('-')[1] + '.' + orderDate.split('-')[0];
    let price = '0';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="6m") price = '107,94 EURO';
    if((data.data.artDerNachsendung=="privat"&&data.data.nachsendeauftragFur+"")=="12m") price = '119,88 EURO';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="6m") price = '117,78 EURO';
    if((data.data.artDerNachsendung!="privat"&&data.data.nachsendeauftragFur1+"")=="12m") price = '131,88 EURO';

    const oldStreatNum = data.data.strasse + ' ' + data.data.nummer;
    const oldZipCode = data.data.plz;
    const oldCity = data.data.ort;
    const oldAddrfull = data.data.adresszusatz ?? '';

    const streatNum = data.data.strasse1 + ' ' + data.data.nummer1;
    const zipCode = data.data.plz1;
    const city = data.data.ort1;
    const addrfull = data.data.adresszusatz1 ?? '';

    const ip = data.metadata.headers['x-real-ip'];

    const invoiceId = data.data.invoiceID;
    const date1 = data.data.date1;
    const date2 = data.data.date2;

    let html = fs.readFileSync(__dirname + '/../../templates/pdf/pow.html', 'utf8');
    html = html
      .replaceAll('{{name}}', name)
      .replaceAll('{{ip}}', ip)
      .replaceAll('{{email}}', to)

      .replaceAll('{{addrfull}}', addrfull)
      .replaceAll('{{oldStreatNum}}', oldStreatNum)
      .replaceAll('{{oldZipCode}}', oldZipCode)
      .replaceAll('{{oldCity}}', oldCity)

      .replaceAll('{{oldAddrfull}}', oldAddrfull)
      .replaceAll('{{streatNum}}', streatNum)
      .replaceAll('{{zipCode}}', zipCode)
      .replaceAll('{{city}}', city)

      .replaceAll('{{addr}}', addr)
      .replaceAll('{{date1}}', date1)
      .replaceAll('{{date2}}', date2)
      .replaceAll('{{price}}', price)
      .replaceAll('{{invoiceId}}', invoiceId);


    const browser = await puppeteer.launch(
      {
        args: ['--no-sandbox']
      }
    );
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

  async updateFormData(id: string, data: any) {
    const FORMIO_HOST = process.env.FORMIO_HOST ?? 'https://formio.ostaadx.ai';
    try {
      const response = await axios.put(`${FORMIO_HOST}/postnachsendeauftrag/submission/${id}`, { data: data });
      if (response.status == 200)
        console.log('successfully updated');
    } catch (error) {
      console.error(error);
    }
  }
}
