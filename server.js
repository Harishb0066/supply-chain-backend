// server.js - Consumer Backend with Blockchain Hash Chaining (CRASH FIXED)
// Run: node server.js

const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose'); // 🔹 ADDED FOR MONGODB

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password'],
    credentials: true
}));

app.use(express.json());

// 🔹 ADDED FOR MONGODB CONNECTION
mongoose.connect(
  "mongodb+srv://Harish0204:Harish2005@cluster1.npllh70.mongodb.net/supplychain",
  
).then(() => {
  console.log("✅ MongoDB Connected");
}).catch(err => {
  console.error("❌ MongoDB Error:", err.message);
});

// 🔹 ADDED FOR MONGODB SCHEMA
const productSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model("Product", productSchema);

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

// ==================== API ROUTES ====================

// ... keep all requires, mongoose connection, schemas, createHash, verifyHashChain, getProductImage ...

app.post('/api/products/sync', async (req, res) => {
  try {
    const { distributorProductId, name, origin, status, timestamp } = req.body;

    console.log('📥 Sync:', { distributorProductId, name, origin, status, timestamp });

    if (await Product.findOne({ distributorId: distributorProductId })) {
      return res.status(400).json({ error: 'Already synced' });
    }

    const last = await Product.findOne().sort({ id: -1 });
    const consumerProductId = last && last.id ? Number(last.id) + 1 : 1;

    const now = new Date();

    // Real-time timestamps
    const farmerTime   = timestamp ? new Date(timestamp) : now;               // from distributor or now
    const distributorTime = now;                                               // when we receive/sync it
    const retailerTime = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);   // example: +3 days — adjust as needed

    const stateMap = { 'Farmer': 0, 'Distributor': 1, 'Retail': 2 };
    const state = stateMap[status] ?? 0;

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
      timestamp: retailerTime.toISOString(),
      description: "Product ready for consumer purchase (estimated)",
      previousHash: distributorBlock.hash
    };
    retailBlock.hash = createHash(retailBlock);

    const batch = `${origin.substring(0,2).toUpperCase()}-${name.toUpperCase().replace(/\s+/g,'')}-${now.getFullYear()}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;

    const productData = {
      id: consumerProductId,
      name,
      origin,
      batch,
      harvestDate: farmerTime.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
      description: `${name} sourced from ${origin} via verified supply chain`,
      state,
      distributorId: distributorProductId,
      syncedAt: now.toISOString(),
      scanCount: 0,
      image: getProductImage(name),
      journey: [farmerBlock, distributorBlock, retailBlock],
    };

    const verification = verifyHashChain(productData.journey);
    console.log('🔐 Verification:', verification.message);

    const publicUrl = `${BASE_URL}/product/${consumerProductId}`;
    productData.qrCode = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });

    await Product.create(productData);

    res.json({
      success: true,
      consumerProductId,
      qrCode: productData.qrCode,
      product: productData,
      hashChainVerified: verification.valid
    });

  } catch (err) {
    console.error('❌ Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Keep all other routes exactly as they are (/api/products, /product/:id, /api/reset, etc.)

app.get('/api/products', async (req, res) => {
  const products = await Product.find({});

  res.json({
    success: true,
    count: products.length,
    products: products.map(p => p.toObject())
  });
});

app.get('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);

  const productDoc = await Product.findOne({ id: productId });

  if (!productDoc) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const product = productDoc.toObject();

  product.scanCount = (product.scanCount || 0) + 1;
  product.lastScanned = new Date().toISOString();

  await Product.updateOne({ id: productId }, { scanCount: product.scanCount, lastScanned: product.lastScanned });

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

app.get('/api/qrcode/:id', async (req, res) => {
  const productId = Number(req.params.id);

  const productDoc = await Product.findOne({ id: productId }, 'qrCode');

  if (!productDoc || !productDoc.qrCode) {
    return res.status(404).json({ error: 'QR code not found' });
  }
  res.json({ success: true, qrCode: productDoc.qrCode });
});

app.get('/api/products/:id/verify', async (req, res) => {
  const productId = Number(req.params.id);

  const productDoc = await Product.findOne({ id: productId });

  if (!productDoc) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const product = productDoc.toObject();

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

app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const adminPassword = req.headers['x-admin-password'];

    if (!adminPassword || adminPassword !== 'admin123') {  // Hardcoded for simplicity; change in production
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid admin password' 
      });
    }

    const productDoc = await Product.findOne({ id: productId });

    if (!productDoc) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    const product = productDoc.toObject();
    const productName = product.name;

    await Product.deleteOne({ id: productId });

    console.log(`🗑️ Deleted product ID ${productId} (${productName})`);

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

app.get('/product/:id', async (req, res) => {
  const productId = Number(req.params.id);

  const productDoc = await Product.findOne({ id: productId });

  if (!productDoc) {
    return res.status(404).send(`
      <h2>Product Not Found</h2>
      <p>Invalid Product ID: ${productId}</p>
    `);
  }

  const product = productDoc.toObject();

  product.scanCount = (product.scanCount || 0) + 1;
  product.lastScanned = new Date().toISOString();
  await Product.updateOne({ id: productId }, { scanCount: product.scanCount, lastScanned: product.lastScanned });

  const analysis = analyzeProduct(product);
  const tamperCheck = verifyHashChain(product.journey);

  res.send(`
    <html>
      <head><title>${product.name}</title></head>
      <body style="font-family:Arial">
        <h2>${analysis.status}</h2>
        <h3>${product.name}</h3>
        <img src="${product.image}" width="300"/>
        <p><b>Origin:</b> ${product.origin}</p>
        <p><b>Batch:</b> ${product.batch}</p>
        <p>${analysis.message}</p>
        <hr/>
        <h4>Journey</h4>
        <ul>
          ${product.journey.map(j => `
            <li>${j.role} - ${j.location}</li>
          `).join('')}
        </ul>
        <p>${tamperCheck.valid ? "✅ Authentic" : "❌ Tampered"}</p>
      </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  const count = await Product.countDocuments();
  res.json({
    status: 'healthy',
    productsCount: count,
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
app.post('/api/reset', async (req, res) => {
  await Product.deleteMany({});
  
  console.log('🔄 Database reset! All products deleted');
  
  res.json({
    success: true,
    message: 'Database reset successfully'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║ 🚀 Consumer Backend running on ${PORT}      ║
║ 🔗 Blockchain Hash Chaining: ✅           ║
║ 🔐 Tamper Detection: ✅                   ║
║ 🌐 CORS: ✅ (All origins)                 ║
╚═══════════════════════════════════════════╝
`);
});
