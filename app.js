const { google } = require('googleapis');
const { createBot, createProvider, createFlow } = require('@bot-whatsapp/bot');
const { BaileysProvider } = require('@bot-whatsapp/provider/baileys');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

// Configuración de Google Sheets API
const SHEET_ID = 'ID_DE_TU_HOJA_DE_CALCULO';
const CREDENTIALS_PATH = path.join(__dirname, 'ruta-a-tus-credenciales.json');

// Autenticación con Google Sheets API
const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// Clase para gestionar los datos desde Google Sheets
class GoogleSheetsDatabase {
    async load() {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Hoja1!A:F', // Ajusta el rango a tus columnas
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No se encontraron datos.');
            return [];
        }
        
        // Convertir las filas en objetos de cliente
        return rows.slice(1).map(row => ({
            nombre: row[0],
            telefono: row[1],
            fechaVencimiento: row[2],
            recordatorioEnviado: row[3]
        }));
    }

    async save(clientes) {
        // Actualiza el estado de recordatorio en Google Sheets
        const values = clientes.map(cliente => [
            cliente.nombre,
            cliente.telefono,
            cliente.fechaVencimiento,
            cliente.recordatorioEnviado
        ]);
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Hoja1!A2', // Ajusta el rango a partir de la primera fila de datos
            valueInputOption: 'RAW',
            resource: { values }
        });
    }
}

// Clase para enviar mensajes de WhatsApp
class WhatsAppService {
    async sendReminder(cliente) {
        const mensaje = `¡Hola, ${cliente.nombre}! Este es un recordatorio de que tu membresía vence el ${cliente.fechaVencimiento}. Por favor, renueva antes de esa fecha para continuar disfrutando de nuestros servicios.`;
        try {
            await axios.post('URL_DE_TU_API_DE_WHATSAPP', {
                to: cliente.telefono,
                body: mensaje
            });
            console.log(`Recordatorio enviado a ${cliente.nombre}`);
        } catch (error) {
            console.error(`Error al enviar el recordatorio a ${cliente.nombre}:`, error.message);
        }
    }
}

// Clase principal del bot de recordatorios
class MembershipReminderBot {
    constructor(database, whatsappService) {
        this.database = database;
        this.whatsappService = whatsappService;
    }

    async revisarMembresias() {
        const clientes = await this.database.load();
        const hoy = new Date();
        hoy.setDate(hoy.getDate() + 4);

        clientes.forEach(cliente => {
            const fechaVencimiento = new Date(cliente.fechaVencimiento);
            if (fechaVencimiento.toDateString() === hoy.toDateString() && cliente.recordatorioEnviado !== 'Sí') {
                this.whatsappService.sendReminder(cliente);
                cliente.recordatorioEnviado = 'Sí';
            }
        });

        await this.database.save(clientes); // Guarda el estado actualizado
    }

    configurarCron() {
        cron.schedule('0 9 * * *', () => {
            console.log("Ejecutando revisión de membresías...");
            this.revisarMembresias();
        });
    }
}

// Inicialización de componentes
const database = new GoogleSheetsDatabase();
const whatsappService = new WhatsAppService();
const reminderBot = new MembershipReminderBot(database, whatsappService);

// Configura el cron job
reminderBot.configurarCron();

// Configuración básica del bot
const flowPrincipal = createFlow([
    {
        keyword: ['membresía', 'ayuda'],
        action: async (ctx) => {
            await ctx.reply('¡Hola! Este es el bot de recordatorio de membresías. Me encargo de recordarte cuando esté próxima a vencerse tu suscripción.');
        }
    }
]);

// Inicialización del bot de WhatsApp
const main = async () => {
    const adapterProvider = new BaileysProvider();

    createBot({
        flow: flowPrincipal,
        provider: adapterProvider,
        database: new MockAdapter(), // No se utiliza el adaptador de datos local
    });

    console.log('Bot de membresías activo y cron configurado para enviar recordatorios.');
};

main();
