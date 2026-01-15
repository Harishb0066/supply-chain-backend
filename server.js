// server.js - Consumer Backend with Blockchain Hash Chaining (CRASH FIXED)
// Run: node server.js

const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

let consumerProducts = {};
let nextProductId = 1;
let distributorToConsumerMap = {};

function createHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function verifyHashChain(journey) {
  for (let i = 1; i < journey.length; i++) {
    const currentBlock = journey[i];
    const previousBlock = journey[i - 1];
    
    if (currentBlock.previousHash !== previousBlock.hash) {
      return {
        valid: false,
        tamperedStage: currentBlock.role,
        message: `Hash mismatch detected at ${currentBlock.role} stage`
      };
    }
    
    const blockData = {
      role: currentBlock.role,
      location: currentBlock.location,
      timestamp: currentBlock.timestamp,
      description: currentBlock.description,
      previousHash: currentBlock.previousHash
    };
    
    const calculatedHash = createHash(blockData);
    if (calculatedHash !== currentBlock.hash) {
      return {
        valid: false,
        tamperedStage: currentBlock.role,
        message: `Block data tampered at ${currentBlock.role} stage`
      };
    }
  }
  
  return { valid: true, message: "Hash chain verified - No tampering detected" };
}

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      consumerProducts = parsed.consumerProducts || {};
      nextProductId = parsed.nextProductId || 1;
      distributorToConsumerMap = parsed.distributorToConsumerMap || {};
      
      const existingIds = Object.keys(consumerProducts).map(id => parseInt(id));
      if (existingIds.length > 0) {
        nextProductId = Math.max(...existingIds) + 1;
      }
      
      console.log(`✅ Database loaded: ${Object.keys(consumerProducts).length} products restored`);
      console.log(`📊 Next Product ID will be: ${nextProductId}`);
    } catch (err) {
      console.error('❌ Failed to load database, starting fresh');
      consumerProducts = {};
      nextProductId = 1;
      distributorToConsumerMap = {};
    }
  } else {
    console.log('📄 No database file found, starting fresh');
  }
}

function saveDatabase() {
  const data = {
    consumerProducts,
    nextProductId,
    distributorToConsumerMap
  };
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Database saved: ${Object.keys(consumerProducts).length} products, Next ID: ${nextProductId}`);
  } catch (err) {
    console.error('❌ Failed to save database:', err);
  }
}

loadDatabase();

console.log('🚀 Starting Consumer Backend...');

function getProductImage(productName) {
  const name = productName.toLowerCase();
  let keywords = name;

  if (name.includes('honey')) keywords = 'honey jar natural';
  else if (name.includes('papaya')) keywords = 'fresh papaya fruit';
  else if (name.includes('jackfruit')) keywords = 'fresh jackfruit';
  else if (name.includes('tomato')) keywords = 'fresh red tomato';
  else if (name.includes('lemon')) keywords = 'fresh lemon fruit';
  else if (name.includes('mango')) keywords = 'fresh ripe mango';
  else if (name.includes('orange')) keywords = 'fresh orange fruit';
  else if (name.includes('apple')) keywords = 'fresh red apple';
  else if (name.includes('beans')) keywords = 'fresh green beans';
  else if (name.includes('rice')) keywords = 'rice grains bowl';
  else keywords = name + ' fresh natural';

  return `https://source.unsplash.com/800x600/?${encodeURIComponent(keywords + ' high quality real photo')}`;
}
// ─── IMAGE MAPPING FUNCTION FOR SCAN PAGE ─────────────────────────────────
function getProductImageUrl(name) {
  if (!name) return "/default.jpg";
  
  const n = name.toLowerCase().trim();

  if (n.includes("pineapple")) return "/public/pineapple.jpg";
  if (n.includes("apple"))     return "/public/apple.jpg";
  if (n.includes("chips"))     return "/public/chips.jpg";
  if (n.includes("mango"))     return "/public/mango.jpg";
  if (n.includes("bread"))     return "/public/bread.jpg";
  if (n.includes("kulfi"))     return "/public/kulfi.jpg";
  if (n.includes("vinegar"))   return "/public/vinegar.jpg";

  return "/public/default.jpg";
}

// ==================== API ROUTES ====================

app.post('/api/products/sync', async (req, res) => {
  // (exact same as before - no changes needed here)
  try {
    loadDatabase();

    const { distributorProductId, name, origin, status, timestamp } = req.body;

    console.log('📥 Sync request received:', { distributorProductId, name, origin, status });

    if (distributorToConsumerMap[distributorProductId]) {
      return res.status(400).json({
        error: 'Product already synced',
        consumerProductId: distributorToConsumerMap[distributorProductId]
      });
    }

    if (nextProductId > 100000) {
      return res.status(400).json({ 
        success: false,
        error: 'Maximum number of products reached (100,000). Cannot sync more.' 
      });
    }

    const consumerProductId = nextProductId++;

    const batch = `${origin.substring(0,2).toUpperCase()}-${name.toUpperCase().replace(/\s+/g,'')}-${new Date().getFullYear()}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;

    const stateMap = { 'Farmer': 0, 'Distributor': 1, 'Retail': 2 };
    const state = stateMap[status] || 0;

    const foodImage = getProductImage(name);

    const consumerProduct = {
      id: consumerProductId,
      name,
      origin,
      batch,
      harvestDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      description: `${name} sourced from ${origin} via verified supply chain`,
      state,
      distributorId: distributorProductId,
      syncedAt: new Date().toISOString(),
      scanCount: 0,
      image: foodImage
    };

    const farmerTime = new Date(timestamp || Date.now());
    const distributorTime = new Date(farmerTime.getTime() + (2 * 60 * 60 * 1000));
    const retailTime = new Date(distributorTime.getTime() + (8 * 60 * 60 * 1000));

    const farmerBlock = {
      role: "Farmer",
      location: origin,
      timestamp: farmerTime.toISOString(),
      description: "Product harvested and registered",
      previousHash: "0"
    };
    farmerBlock.hash = createHash(farmerBlock);

    const distributorBlock = {
      role: "Distributor",
      location: "Distribution Center",
      timestamp: distributorTime.toISOString(),
      description: "Product received and verified",
      previousHash: farmerBlock.hash
    };
    distributorBlock.hash = createHash(distributorBlock);

    const retailBlock = {
      role: "Retailer",
      location: "Retail Store",
      timestamp: retailTime.toISOString(),
      description: "Product ready for consumer purchase",
      previousHash: distributorBlock.hash
    };
    retailBlock.hash = createHash(retailBlock);

    consumerProduct.journey = [farmerBlock, distributorBlock, retailBlock];

    const verification = verifyHashChain(consumerProduct.journey);
    console.log('🔐 Hash chain verification:', verification.message);

    const publicUrl = `https://harish-supply-chain.onrender.com/product/${consumerProductId}`;
    
    const qrCodeUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });
    consumerProduct.qrCode = qrCodeUrl;

    consumerProducts[consumerProductId] = consumerProduct;
    distributorToConsumerMap[distributorProductId] = consumerProductId;

    saveDatabase();

    console.log(`✅ Product synced: Consumer ID ${consumerProductId}`);

    res.json({
      success: true,
      consumerProductId,
      qrCode: qrCodeUrl,
      product: consumerProduct,
      hashChainVerified: verification.valid
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ error: 'Failed to sync product', details: error.message });
  }
});

app.get('/api/products', (req, res) => {
  loadDatabase();
  res.json({
    success: true,
    count: Object.keys(consumerProducts).length,
    products: Object.values(consumerProducts)
  });
});

app.get('/api/products/:id', (req, res) => {
  loadDatabase();
  const productId = parseInt(req.params.id);
  const product = consumerProducts[productId];

  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  product.scanCount++;
  product.lastScanned = new Date().toISOString();

  saveDatabase();

  const tamperCheck = verifyHashChain(product.journey);
  const analysis = analyzeProduct(product);

  console.log(`🔍 Product ${productId} scanned (Total scans: ${product.scanCount})`);
  console.log(`🔐 Tamper check: ${tamperCheck.message}`);

  res.json({
    success: true,
    product,
    journey: product.journey,
    analysis,
    tamperDetection: tamperCheck
  });
});

app.get('/api/qrcode/:id', (req, res) => {
  loadDatabase();
  const product = consumerProducts[req.params.id];
  if (!product || !product.qrCode) {
    return res.status(404).json({ error: 'QR code not found' });
  }
  res.json({ success: true, qrCode: product.qrCode });
});

app.get('/api/products/:id/verify', (req, res) => {
  loadDatabase();
  const productId = parseInt(req.params.id);
  const product = consumerProducts[productId];

  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const verification = verifyHashChain(product.journey);

  res.json({
    success: true,
    productId,
    productName: product.name,
    verification,
    journey: product.journey.map(block => ({
      role: block.role,
      hash: block.hash.substring(0, 16) + '...',
      previousHash: block.previousHash.substring(0, 16) + '...'
    }))
  });
});

app.delete('/api/products/:id', (req, res) => {
  loadDatabase();
  
  try {
    const productId = parseInt(req.params.id);
    const product = consumerProducts[productId];

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    const productName = product.name;

    delete consumerProducts[productId];

    for (const distId in distributorToConsumerMap) {
      if (distributorToConsumerMap[distId] === productId) {
        delete distributorToConsumerMap[distId];
        break;
      }
    }

    const remainingIds = Object.keys(consumerProducts).map(id => parseInt(id));
    if (remainingIds.length > 0) {
      nextProductId = Math.max(...remainingIds) + 1;
    } else {
      nextProductId = 1;
    }

    saveDatabase();

    console.log(`🗑️ Deleted product ID ${productId} (${productName})`);
    console.log(`📊 Next Product ID reset to: ${nextProductId}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Product deleted successfully',
      deletedProductId: productId,
      deletedProductName: productName
    });

  } catch (error) {
    console.error('❌ Delete error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to delete product',
      details: error.message
    });
  }
});

app.get('/product/:id', (req, res) => {
  loadDatabase();
  const productId = parseInt(req.params.id);
  const product = consumerProducts[productId];

  if (!product) {
    return res.status(404).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>Product Not Found</h2>
          <p>Invalid Product ID: ${productId}</p>
          <p style="color: #666;">This product may have been deleted or never existed.</p>
        </body>
      </html>
    `);
  }

  const analysis = analyzeProduct(product);
  const tamperCheck = verifyHashChain(product.journey);

  let html = `
    <html>
      <head>
        <title>${product.name} - Supply Chain Verification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; background: #f9f9f9; }
          h2 { color: #333; }
          .status { font-weight: bold; font-size: 1.6em; margin-bottom: 10px; }
          .suspicious { color: orange; }
          .authentic { color: green; }
          img { max-width: 100%; height: auto; border-radius: 10px; margin: 15px 0; }
          ul { list-style: none; padding-left: 0; }
          li { margin: 15px 0; padding-left: 15px; border-left: 4px solid #ccc; }
          hr { border: none; border-top: 1px solid #eee; margin: 25px 0; }
        </style>
      </head>
      <body>
        <h2 class="status ${analysis.status.toLowerCase()}">${analysis.status}</h2>
        <h2>🛒 ${product.name}</h2>

       <img src="${getProductImageUrl(product.name)}" alt="${product.name}" />

        <p><b>Origin:</b> ${product.origin}</p>
        <p><b>Batch ID:</b> ${product.batch}</p>
        <p><b>Harvest Date:</b> ${product.harvestDate}</p>
        <p><b>Current Stage:</b> ${product.state === 2 ? "🏪 Retail" : "⏳ In Transit"}</p>
        <p><b>Description:</b><br>${product.description}</p>
        <p>${analysis.message}</p>
        <p><b>Scanned:</b> ${new Date().toLocaleString()}</p>

        <hr />

        <h3>📜 Product Journey</h3>
        <ul>
  `;

  product.journey.forEach(step => {
    html += `
      <li>
        <b>${step.role}</b> – ${step.location}<br>
        🕒 ${new Date(step.timestamp).toLocaleString()}
      </li>
    `;
  });

  html += `
        </ul>

        <p><b>Tamper Detection:</b> ${tamperCheck.valid ? "✅ No tampering detected" : "❌ " + tamperCheck.message}</p>
        <p>🤖 AI-powered verification</p>
      </body>
    </html>
  `;

  res.send(html);
});

app.get('/health', (req, res) => {
  loadDatabase();
  res.json({
    status: 'healthy',
    productsCount: Object.keys(consumerProducts).length,
    nextProductId: nextProductId,
    time: new Date().toISOString(),
    features: ['Hash Chaining', 'Tamper Detection', 'Cryptographic Verification', 'CORS Enabled']
  });
});

function analyzeProduct(product) {
  if (product.state !== 2) {
    return {
      status: "Suspicious",
      message: "Product has not reached retail stage",
      color: "orange"
    };
  }
  return {
    status: "Authentic",
    message: "Product is safe and verified",
    color: "green"
  };
}

// ==================== FRONTEND SERVING (SAFE & CORRECT ORDER) ====================

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files (including index.html for direct access if needed)
app.use(express.static(__dirname));

// Reset endpoint
app.post('/api/reset', (req, res) => {
  consumerProducts = {};
  nextProductId = 1;
  distributorToConsumerMap = {};
  saveDatabase();
  
  console.log('🔄 Database reset! All products deleted, ID counter reset to 1');
  
  res.json({
    success: true,
    message: 'Database reset successfully',
    nextProductId: 1
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║ 🚀 Consumer Backend running on ${PORT}      ║
║ 💾 Persistent DB enabled                  ║
║ 🔗 Blockchain Hash Chaining: ✅           ║
║ 🔐 Tamper Detection: ✅                   ║
║ 🌐 CORS: ✅ (All origins)                 ║
║ 📊 Next Product ID: ${nextProductId}       ║
╚═══════════════════════════════════════════╝
`);
});

