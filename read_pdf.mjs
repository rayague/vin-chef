import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const dataBuffer = fs.readFileSync('public/pdfcoffee.com_e-mecef-api-v10-pdf-free.pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('emcf-doc.txt', data.text);
    console.log('Done!');
}).catch(err => {
    console.error(err);
});
