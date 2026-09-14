import nodemailer from 'nodemailer';
import { ResendTransport,SmtpRecipientRejected,type EmailTransport } from '../../../../lib/email-providers.js';
import { decryptCredentials,EmailInputError } from '../../../../lib/email-security.js';
export function mailboxTransport(mailbox:Record<string,any>):EmailTransport {
 const credentials=decryptCredentials(mailbox.smtp_password,mailbox.from_email);
 if(mailbox.provider==='resend') {if(!credentials.apiKey) throw new EmailInputError('Mailbox API credentials are missing');return new ResendTransport(credentials.apiKey,fetch,credentials.domainId);}
 if(!credentials.password) throw new EmailInputError('Mailbox SMTP credentials are missing');
 const smtp=nodemailer.createTransport({host:mailbox.smtp_host,port:mailbox.smtp_port,secure:mailbox.smtp_port===465,requireTLS:true,tls:{rejectUnauthorized:true},auth:{user:mailbox.smtp_user,pass:credentials.password},logger:false,debug:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
 return {async prepare(){try{await smtp.verify();}catch{throw new EmailInputError('SMTP authentication failed');}},async send(m) {try {const result=await smtp.sendMail({from:{name:m.fromName,address:m.fromEmail},to:m.to,subject:m.subject,text:m.text,html:m.html,messageId:m.messageId,headers:m.headers,disableFileAccess:true,disableUrlAccess:true});if(result.rejected?.length || !result.accepted?.length) throw new Error();return {messageId:m.messageId};}catch(error) {const e=error as {code?:string;command?:string;responseCode?:number};if(e.code==='EENVELOPE'&&e.command==='RCPT TO'&&Number(e.responseCode)>=500&&Number(e.responseCode)<600)throw new SmtpRecipientRejected();throw new Error('Provider dispatch outcome is unknown');}finally{smtp.close();}}};
}
