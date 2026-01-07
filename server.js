// server.js - Consumer Backend with MongoDB (FIXED)
// Run: node server.js

const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password'],
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

// MongoDB Schema with proper ID handling
const productSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  origin: String,
  batch: String,
  harvestDate: String,
  description: String,
  state: Number,
  distributorId: Number,
  syncedAt: Date,
  scanCount: { type: Number, default: 0 },
  image: String,
  qrCode: String,
  journey: Array,
  lastScanned: Date
}, { strict: false });

const Product = mongoose.model("Product", productSchema);

// Counter schema for auto-incrementing IDs
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 1 }
});

const Counter = mongoose.model("Counter", counterSchema);

// Get next product ID
async function getNextProductId() {
  const counter = await Counter.findOneAndUpdate(
    { name: 'productId' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
}

// Admin password (change this!)
const ADMIN_PASSWORD = "admin123";

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
  else if (name.includes('potato')) keywords = 'potato fresh natural';
  else if (name.includes('wheat')) keywords = 'wheat fresh natural';
  else keywords = name + ' fresh natural';

  return `https://source.unsplash.com/800x600/?${encodeURIComponent(keywords + ' high quality real photo')}`;
}

// ==================== API ROUTES ====================

// Admin verification endpoint
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, message: 'Admin authenticated' });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Middleware to check admin auth
function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  
  if (password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
}

app.post('/api/products/sync', async (req, res) => {
  try {
    const { distributorProductId, name, origin, status, timestamp } = req.body;

    console.log('📥 Sync request received:', { distributorProductId, name, origin, status });

    // Check if already synced
    const existing = await Product.findOne({ distributorId: distributorProductId });
    if (existing) {
      return res.status(400).json({
        error: 'Product already synced',
        consumerProductId: existing.id
      });
    }

    // Get next ID
    const consumerProductId = await getNextProductId();

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
      syncedAt: new Date(),
      scanCount: 0,
      image: foodImage
    };

    // Create hash chain
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

    // Generate QR code
    const publicUrl = `https://harish-supply-chain.onrender.com/product/${consumerProductId}`;
    const qrCodeUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });
    consumerProduct.qrCode = qrCodeUrl;

    // Save to MongoDB
    await Product.create(consumerProduct);

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

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ syncedAt: -1 }).lean();
    
    console.log(`📦 Returning ${products.length} products`);
    if (products.length > 0) {
      console.log('Sample product:', products[0]);
    }
    
    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await Product.findOne({ id: productId });

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Increment scan count
    product.scanCount++;
    product.lastScanned = new Date();
    await product.save();

    const tamperCheck = verifyHashChain(product.journey);
    const analysis = analyzeProduct(product);

    console.log(`🔍 Product ${productId} scanned (Total scans: ${product.scanCount})`);
    console.log(`🔐 Tamper check: ${tamperCheck.message}`);

    res.json({
      success: true,
      product: product.toObject(),
      journey: product.journey,
      analysis,
      tamperDetection: tamperCheck
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/qrcode/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ id: parseInt(req.params.id) });
    if (!product || !product.qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    res.json({ success: true, qrCode: product.qrCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id/verify', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await Product.findOne({ id: productId });

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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await Product.findOne({ id: productId });

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

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
  try {
    const productId = parseInt(req.params.id);
    const product = await Product.findOne({ id: productId });

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

          <img src="${product.image}" alt="${product.name}" />

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
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
});

app.get('/health', async (req, res) => {
  try {
    const count = await Product.countDocuments();
    const counter = await Counter.findOne({ name: 'productId' });
    
    res.json({
      status: 'healthy',
      productsCount: count,
      nextProductId: counter ? counter.value : 1,
      time: new Date().toISOString(),
      features: ['MongoDB', 'Hash Chaining', 'Tamper Detection', 'CORS Enabled']
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
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

// ==================== FRONTEND SERVING ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

// Reset endpoint (ADMIN ONLY)
app.post('/api/reset', requireAdmin, async (req, res) => {
  try {
    await Product.deleteMany({});
    await Counter.deleteOne({ name: 'productId' });
    
    console.log('🔄 Database reset! All products deleted, ID counter reset to 1');
    
    res.json({
      success: true,
      message: 'Database reset successfully',
      nextProductId: 1
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Reset failed',
      details: error.message 
    });
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
╚═══════════════════════════════════════════╝
`);
});
