const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ML_APP_ID = '2760330023974605';
const ML_SECRET = '6qEVEDMdMl169pZY86f2kUEDtxOQWqOe';

let productos = [];
let mlToken = null;

// Obtener token de ML
async function obtenerTokenML() {
  try {
    const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'client_credentials',
      client_id: ML_APP_ID,
      client_secret: ML_SECRET
    });
    mlToken = data.access_token;
    console.log('✅ Token ML obtenido');
  } catch (e) {
    console.log('Error token ML:', e.message);
  }
}

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
    legoOficial: null,
    juguetron: null,
    timestamp: new Date().toISOString()
  };

  // Mercado Libre con token
  try {
    if (!mlToken) await obtenerTokenML();
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
    mlToken = null;
  }

  // LEGO Oficial MX
  try {
    const url = `https://www.lego.com/es-mx/search?q=${numeroSet}`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(data);
    const precio = $('[data-test="product-leaf-price"]').first().text().trim();
    const titulo = $('[data-test="product-leaf-title"]').first().text().trim();
    if (precio) {
      resultados.legoOficial = {
        precio: parseFloat(precio.replace(/[^0-9.]/g, '')),
        url: `https://www.lego.com/es-mx/search?q=${numeroSet}`,
        titulo: titulo || `LEGO ${numeroSet}`,
        enStock: true
      };
    }
  } catch (e) {
    console.log('Error LEGO:', e.message);
  }

  // Juguetron
  try {
    const url = `https://lego.juguetron.mx/search?q=${numeroSet}`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(data);
    const precio = $('.price').first().text().trim();
    const titulo = $('.product-title').first().text().trim();
    if (precio) {
      resultados.juguetron = {
        precio: parseFloat(precio.replace(/[^0-9.]/g, '')),
        url: `https://lego.juguetron.mx/search?q=${numeroSet}`,
        titulo: titulo || `LEGO ${numeroSet}`,
        enStock: true
      };
    }
  } catch (e) {
    console.log('Error Juguetron:', e.message);
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

obtenerTokenML();

app.listen(PORT, () => {
  console.log(`BrickAlert Server corriendo en puerto ${PORT}`);
});
