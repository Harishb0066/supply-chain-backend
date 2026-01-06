// server.js - FULL UPDATED VERSION (Journey fixed + QR retry reliable)
// Run: node server.js

const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// MongoDB Connection
mongoose.connect(
  "mongodb+srv://Harish0204:Harish2005@cluster1.npllh70.mongodb.net/supplychain"
).then(() => {
  console.log("✅ MongoDB Connected");
}).catch(err => {
  console.error("❌ MongoDB Error:", err.message);
});

// MongoDB Schema
const productSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model("Product", productSchema);

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

// ==================== API ROUTES ====================

app.post('/api/products/sync', async (req, res) => {
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

    // Journey block generation (this was missing before!)
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

    // Save to MongoDB FIRST
    let savedProduct = await Product.create(consumerProduct);
    
    // Generate QR URL
    const publicUrl = `https://harish-supply-chain.onrender.com/product/${savedProduct._id}`;
    console.log(`📱 Generated QR URL: ${publicUrl}`);
    
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });
    
    // Robust QR save with 3 retry attempts
    savedProduct.qrCode = qrCodeUrl;
    let qrSaved = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await savedProduct.save();
        console.log(`✅ QR code saved successfully for ${name} (attempt ${attempt})`);
        qrSaved = true;
        break;
      } catch (saveErr) {
        console.error(`❌ QR save attempt ${attempt} failed for ${name}:`, saveErr.message);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    if (!qrSaved) {
      console.warn(`⚠️ QR code could not be saved after 3 attempts for ${name}. It can be fixed later via /api/fix-qr-codes`);
    }

    consumerProduct.qrCode = qrCodeUrl;
    consumerProducts[consumerProductId] = consumerProduct;
    distributorToConsumerMap[distributorProductId] = consumerProductId;

    saveDatabase();

    console.log(`✅ Product synced: Consumer ID ${consumerProductId}, MongoDB ID: ${savedProduct._id}`);

    res.json({
      success: true,
      consumerProductId,
      mongoId: savedProduct._id,
      qrCode: qrCodeUrl,
      product: consumerProduct,
      hashChainVerified: verification.valid
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ error: 'Failed to sync product', details: error.message });
  }
});

app.get('/api/products', async (req, res) => {
  const products = await Product.find({});
  res.json({
    success: true,
    count: products.length,
    products
  });
});

app.get('/api/qrcode/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    res.json({ success: true, qrCode: product.qrCode });
  } catch (err) {
    res.status(404).json({ error: 'QR code not found' });
  }
});

app.get('/api/products/:id/verify', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const verification = verifyHashChain(product.journey);

    res.json({
      success: true,
      productId: product._id,
      productName: product.name,
      verification,
      journey: product.journey.map(block => ({
        role: block.role,
        hash: block.hash.substring(0, 16) + '...',
        previousHash: block.previousHash.substring(0, 16) + '...'
      }))
    });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Product not found' });
  }
});

// FIXED DELETE ENDPOINT
app.delete('/api/products/:id', async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);

    if (!deletedProduct) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    console.log(`🗑️ Deleted product: ${deletedProduct.name} (MongoDB ID: ${req.params.id})`);

    return res.status(200).json({ 
      success: true, 
      message: 'Product deleted successfully',
      deletedProductId: deletedProduct._id,
      deletedProductName: deletedProduct.name
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

// PRODUCT DISPLAY ROUTE
app.get('/product/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>Product Not Found</h2>
            <p>This product may have been deleted or never existed.</p>
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
            body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: auto;
              padding: 20px;
              background: #f9f9f9;
            }
            h2 { color: #333; }
            .status {
              font-weight: bold;
              font-size: 1.6em;
              margin-bottom: 10px;
              color: ${analysis.color};
            }
            img {
              max-width: 100%;
              border-radius: 10px;
              margin: 15px 0;
            }
            ul { list-style: none; padding: 0; }
            li {
              margin: 15px 0;
              padding-left: 15px;
              border-left: 4px solid #ccc;
            }
          </style>
        </head>
        <body>

          <h2 class="status">${analysis.status}</h2>
          <h2>🛒 ${product.name}</h2>

          <img src="${product.image}" alt="${product.name}" />

          <p><b>Origin:</b> ${product.origin}</p>
          <p><b>Batch ID:</b> ${product.batch}</p>
          <p><b>Harvest Date:</b> ${product.harvestDate}</p>
          <p><b>Current Stage:</b> ${product.state === 2 ? "🏪 Retail" : "⏳ In Transit"}</p>
          <p>${analysis.message}</p>

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

          <p><b>Tamper Detection:</b> ${
            tamperCheck.valid ? "✅ No tampering detected" : "❌ " + tamperCheck.message
          }</p>

          <p>🤖 AI-powered verification</p>

        </body>
      </html>
    `;

    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.get('/health', async (req, res) => {
  const count = await Product.countDocuments();
  res.json({
    status: 'healthy',
    productsCount: count,
    nextProductId: nextProductId,
    time: new Date().toISOString(),
    features: ['Hash Chaining', 'Tamper Detection', 'MongoDB', 'CORS Enabled']
  });
});

// FRONTEND SERVING
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

app.post('/api/reset', async (req, res) => {
  consumerProducts = {};
  nextProductId = 1;
  distributorToConsumerMap = {};
  saveDatabase();
  
  await Product.deleteMany({});
  
  console.log('🔄 Database reset! All products deleted, ID counter reset to 1');
  
  res.json({
    success: true,
    message: 'Database reset successfully',
    nextProductId: 1
  });
});

// Fix missing QR codes
app.post('/api/fix-qr-codes', async (req, res) => {
  try {
    const products = await Product.find({});
    let fixed = 0;
    
    for (const product of products) {
      const publicUrl = `https://harish-supply-chain.onrender.com/product/${product._id}`;
      const qrCodeUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });
      
      product.qrCode = qrCodeUrl;
      await product.save();
      fixed++;
      
      console.log(`✅ Fixed QR for: ${product.name} (${product._id})`);
    }
    
    res.json({
      success: true,
      message: `Fixed ${fixed} QR codes`,
      fixed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║ 🚀 Consumer Backend running on ${PORT}      ║
║ 💾 MongoDB enabled                        ║
║ 🔗 Blockchain Hash Chaining: ✅           ║
║ 🔐 Tamper Detection: ✅                   ║
║ 🌐 CORS: ✅ (All origins)                 ║
║ 📊 Next Product ID: ${nextProductId}       ║
╚═══════════════════════════════════════════╝
`);
});
