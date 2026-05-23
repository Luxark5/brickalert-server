const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ML_APP_ID = '2760330023974605';
const ML_SECRET = '6qEVEDMdMl169pZY86f2kUEDtxOQWqOe';
const ML_REDIRECT = 'https://brickalert-server-production.up.railway.app/auth';

let productos = [];
let mlToken = null;

// Callback de ML OAuth
app.get('/auth', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No code' });
    
    try {
        const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: ML_APP_ID,
            client_secret: ML_SECRET,
            code,
            redirect_uri: ML_REDIRECT
        });
        
        mlToken = data.access_token;
        console.log('✅ Token ML obtenido via OAuth');
        
        res.send(`
            <html>
            <body style="font-family:sans-serif;padding:20px;background:#1a1a1a;color:white;">
                <h2>✅ BrickAlert conectado!</h2>
                <p>Copia este token:</p>
                <textarea style="width:100%;height:100px;background:#333;color:yellow;padding:10px;">${mlToken}</textarea>
                <br><br>
                <a href="brickalert://auth?token=${mlToken}" style="background:yellow;color:black;padding:15px;border-radius:10px;text-decoration:none;font-weight:bold;">
                    Abrir BrickAlert
                </a>
            </body>
            </html>
        `);
    } catch (e) {
        console.log('Error OAuth:', e.response?.data || e.message);
        res.status(500).send(`
            <html>
            <body style="font-family:sans-serif;padding:20px;background:#1a1a1a;color:white;">
                <h2>❌ Error de conexión</h2>
                <p>${e.response?.data?.message || e.message}</p>
            </body>
            </html>
        `);
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'BrickAlert Server funcionando', productos: productos.length });
});

app.post('/productos', (req, res) => {
    const { id, nombre, numeroSet } = req.body;
    if (!productos.find(p => p.id === id)) {
        productos.push({ id, nombre, numeroSet });
    }
    res.json({ ok: true });
});

app.get('/precios/:numeroSet', async (req, res) => {
    const { numeroSet } = req.params;
    try {
        const precios = await obtenerPrecios(numeroSet);
        res.json(precios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener precios' });
    }
});

async function obtenerPrecios(numeroSet) {
    const resultados = {
        numeroSet,
        mercadoLibre: null,
        timestamp: new Date().toISOString()
    };

    if (mlToken) {
        try {
            const url = `https://api.mercadolibre.com/sites/MLM/search?q=lego+${numeroSet}&limit=5`;
            const { data } = await axios.get(url, {
                timeout: 10000,
                headers: { 'Authorization': `Bearer ${mlToken}` }
            });
            if (data.results && data.results.length > 0) {
                const legos = data.results.filter(i =>
                    i.title.toLowerCase().includes('lego') &&
                    i.available_quantity > 0
                );
                if (legos.length > 0) {
                    const item = legos[0];
                    resultados.mercadoLibre = {
                        precio: item.price,
                        url: item.permalink,
                        titulo: item.title,
                        enStock: true
                    };
                }
            }
        } catch (e) {
            console.log('Error ML:', e.message);
            if (e.response?.status === 401) mlToken = null;
        }
    }

    return resultados;
}

cron.schedule('0 * * * *', async () => {
    console.log('Revisando precios...');
    for (const producto of productos) {
        const precios = await obtenerPrecios(producto.numeroSet);
        console.log(`${producto.nombre}: ML $${precios.mercadoLibre?.precio || 'N/D'}`);
    }
});

app.listen(PORT, () => {
    console.log(`BrickAlert Server corriendo en puerto ${PORT}`);
});
