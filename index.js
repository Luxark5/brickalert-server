const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let productos = [];

app.get('/', (req, res) => {
  res.json({ status: 'BrickAlert Server funcionando', productos: productos.length });
});

app.post('/productos', (req, res) => {
  const { id, nombre, numeroSet } = req.body;
  const existe = productos.find(p => p.id === id);
  if (!existe) {
    productos.push({ id, nombre, numeroSet, precios: {} });
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
  try {
    const url = `https://api.mercadolibre.com/sites/MLM/search?q=lego+${numeroSet}&limit=1`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      if (item.title.toLowerCase().includes('lego')) {
        resultados.mercadoLibre = {
          precio: item.price,
          url: item.permalink,
          titulo: item.title
        };
      }
    }
  } catch (e) {
    console.log('Error ML:', e.message);
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
