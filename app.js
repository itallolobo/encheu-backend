// Required dependencies
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const app = express();

// Middleware
app.use(cors({
}));
app.use(express.json());

// Database configuration
const pool = new Pool({
  connectionString: "postgres://default:fsS1Ngj8pxWQ@ep-calm-hall-a4kte8qg.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require"
});


// API Key middleware for ESP32
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (apiKey !== 'aquario123') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Database initialization
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ph DECIMAL(5,2),
        temperature DECIMAL(5,2),
        turbidity INTEGER,
        water_level DECIMAL(5,2),
        battery_level DECIMAL(5,2),
        error_code INTEGER
      );

      CREATE TABLE IF NOT EXISTS fish_species (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        scientific_name VARCHAR(100),
        min_ph DECIMAL(4,1),
        max_ph DECIMAL(4,1),
        min_temp DECIMAL(4,1),
        max_temp DECIMAL(4,1)
      );

      CREATE TABLE IF NOT EXISTS aquarium_fish (
        id SERIAL PRIMARY KEY,
        species_id INTEGER REFERENCES fish_species(id),
        name VARCHAR(100),
        added_date DATE DEFAULT CURRENT_DATE,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS tank_dimensions (
        id SERIAL PRIMARY KEY,
        length DECIMAL(6,2),
        width DECIMAL(6,2),
        height DECIMAL(6,2),
        sensor_offset DECIMAL(6,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

// Health calculation function
function calculateHealth(measurements, fishSpecies, sendPush=false) {
  const weights = {
    ph: 0.75,
    temperature: 1,
    turbidity: 0.00,
    water_level: 1
  };

  let score = 100;
  const issues = [];
  const alerts = [];

  // Check pH across all species
  const phRanges = fishSpecies.map(s => ({min: s.min_ph, max: s.max_ph}));
  const minPh = Math.min(...phRanges.map(r => r.min));
  const maxPh = Math.max(...phRanges.map(r => r.max));
  if (measurements.ph < minPh || measurements.ph > maxPh) {
    const phRange = maxPh - minPh;
    offrange = measurements.ph > maxPh ? 
      ((measurements.ph - maxPh) / phRange) * 100 : 
      ((minPh - measurements.ph) / phRange) * 100;    
    score -= offrange * weights.ph;

    const severity = offrange > 20 ? 'critical' : 'warning';
    const message = offrange < 1.5 ? 
      'O pH precisa ser equilibrado com urgência' : 
      'O pH precisa de atenção';
    
    issues.push(message);
    alerts.push({
      parameter: 'pH',
      severity,
      title: 'pH Inadequado',
      message: `${message}. pH atual: ${measurements.ph}, Faixa ideal: ${minPh}-${maxPh}`
    });
    // Add notification
    if(sendPush){
      sendPushNotification(`🔴 Alerta: ${message}. pH atual: ${measurements.ph}`,'ph',sendPush);

    }
  }

  // Check temperature across all species
  const tempRanges = fishSpecies.map(s => ({min: s.min_temp, max: s.max_temp}));
  const minTemp = Math.min(...tempRanges.map(r => r.min));
  const maxTemp = Math.max(...tempRanges.map(r => r.max));
  
  if (measurements.temperature < minTemp || measurements.temperature > maxTemp) {
    const tempRange = maxTemp - minTemp;
    offrange = measurements.temperature > maxTemp ? 
      ((measurements.temperature - maxTemp) / tempRange) * 100 : 
      ((minTemp - measurements.temperature) / tempRange) * 100;
    score -= offrange * weights.temperature;
    
    const severity = offrange > 20 ? 'critical' : 'warning';
    const message = offrange > 20 ? 
      'A temperatura precisa ser ajustada com urgência' : 
      'A temperatura precisa de atenção';
    
    issues.push(message);
    alerts.push({
      parameter: 'Temperatura',
      severity,
      title: 'Temperatura Inadequada',
      message: `${message}. Temperatura atual: ${measurements.temperature}°C, Faixa ideal: ${minTemp}-${maxTemp}°C`
    });
    // Add notification
    sendPushNotification(`🔴 Alerta: ${message}. Temperatura atual: ${measurements.temperature}°C`,'temp',sendPush);
  }

  // Check turbidity
  if (measurements.turbidity > 10) {
    score -= ((measurements.turbidity - 10) / 10) * weights.turbidity;
    const severity = measurements.turbidity > 20 ? 'critical' : 'warning';
    const message = measurements.turbidity > 20 ? 
      'A água precisa ser trocada com urgência' : 
      'Considere fazer uma troca parcial de água';
    
    issues.push(message);
    alerts.push({
      parameter: 'Turbidez',
      severity,
      title: 'Água Turva',
      message: `${message}. Turbidez atual: ${measurements.turbidity} NTU`
    });
    // Add notification
    sendPushNotification(`🔴 Alerta: ${message}. Turbidez atual: ${measurements.turbidity} NTU`,'turb',sendPush);
  }
  const actualWaterLevel = calculateWaterLevelPercentage(measurements.water_level);
  // Check water level
  if (actualWaterLevel < 85) {
    offrange = ((85 - actualWaterLevel) / 85) * 100;
    score -= offrange * weights.water_level;
    const severity = actualWaterLevel < 75 ? 'critical' : 'warning';
    const message = measurements.water_level < 75 ? 
      'Necessário completar o nível de água com urgência' : 
      'Recomendado completar o nível de água';
    
    issues.push(message);
    alerts.push({
      parameter: 'Nível de Água',
      severity,
      title: 'Nível Baixo',
      message: `${message}. Nível atual: ${measurements.water_level}%`
    });
    // Add notification
    sendPushNotification(`🔴 Alerta: ${message}. Nível atual: ${actualWaterLevel}%`,'nivel',sendPush);
  }

  score = Math.max(0, Math.round(score));

  let status, message;
  if (score >= 80) {
    status = 'Bom';
    message = 'O aquário está em boas condições';
  } else if (score >= 60) {
    status = 'Atenção';
    message = 'Alguns parâmetros precisam de atenção';
  } else {
    status = 'Crítico';
    message = 'Ação imediata necessária para corrigir os parâmetros';
  }

  return {
    score,
    status,
    message,
    issues,
    alerts
  };
}

// Add this function after the calculateHealth function
async function calculateWaterLevelPercentage(waterLevel) {
  try {
    // Get latest tank dimensions
    const dimensionsResult = await pool.query(
      'SELECT height, sensor_offset FROM tank_dimensions ORDER BY created_at DESC LIMIT 1'
    );

    if (dimensionsResult.rows.length === 0) {
      return waterLevel; // Return raw value if no tank dimensions exist
    }

    const { height, sensor_offset } = dimensionsResult.rows[0];
    const totalHeight = height;
    const measuredHeight = waterLevel;
    
    // Calculate percentage considering sensor offset
    // Formula: (measured_height / (total_height - sensor_offset)) * 100
    const percentage = 100 - (((measuredHeight - sensor_offset)  / totalHeight ) * 100);
    
    // Clamp value between 0 and 100
    return percentage;
  } catch (error) {
    console.error('Error calculating water level percentage:', error);
    return waterLevel; // Return raw value on error
  }
}

let lastNotificationSent = 0;
const NOTIFICATION_COOLDOWN = 60 * 60 * 1000; // 30 minutes in milliseconds

// Helper function to check notification timing
function canSendNotification() {
  const now = Date.now();
  if (now - lastNotificationSent >= NOTIFICATION_COOLDOWN) {
    lastNotificationSent = now;
    return true;
  }
  return false;
}

async function sendPushNotification(message) {
  if (!canSendNotification()) {
    console.log(`Skipping notification "${message}" - global cooldown active`);
    return;
  }

  try {
    await axios.post('https://notify.run/46ly8XS4o5YJwq4Un61o', message, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    console.log('Push notification sent:', message);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}
app.get('/api/reset', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Drop all tables
    await client.query(`
      DROP TABLE IF EXISTS measurements CASCADE;
      DROP TABLE IF EXISTS aquarium_fish CASCADE;
      DROP TABLE IF EXISTS fish_species CASCADE;
      DROP TABLE IF EXISTS tank_dimensions CASCADE;
    `);

    // Reinitialize database
    await initDB();

    client.release();

    // Send success response before restart
    res.json({ message: 'Dataset reset successful, restarting service...' });

    // Restart server after small delay
    setTimeout(() => {
      process.exit(0); // PM2/system service will restart the application
    }, 1000);

  } catch (error) {
    console.error('Error in POST /api/reset:', error);
    res.status(500).json({ error: error.message });
  }
});
// Update the measurements POST endpoint to include battery_level and error_code
app.post('/api/measurements', validateApiKey, async (req, res) => {
  try {
    const { ph, temperature, turbidity, water_level, battery_level, error_code } = req.body;
    
    const result = await pool.query(
      `INSERT INTO measurements 
       (ph, temperature, turbidity, water_level, battery_level, error_code) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING 
         id,
         timestamp,
         COALESCE(ph::numeric, null) as ph,
         COALESCE(temperature::numeric, null) as temperature,
         COALESCE(turbidity::integer, null) as turbidity,
         COALESCE(water_level::numeric, null) as water_level,
         COALESCE(battery_level::numeric, null) as battery_level,
         error_code`,
      [ph, temperature, turbidity, water_level, battery_level, error_code]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in POST /api/measurements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modify the GET measurements endpoint
app.get('/api/measurements', async (req, res) => {
  try {
    const { range = '24h' } = req.query;
    let timeFilter;
    
    switch (range) {
      case '7d':
        timeFilter = 'timestamp >= NOW() - INTERVAL \'7 days\'';
        break;
      case '30d':
        timeFilter = 'timestamp >= NOW() - INTERVAL \'30 days\'';
        break;
      case '90d':
        timeFilter = 'timestamp >= NOW() - INTERVAL \'90 days\'';
        break;
      default: // 24h
        timeFilter = 'timestamp >= NOW() - INTERVAL \'24 hours\'';
    }
    
    const results = await pool.query(
      `SELECT 
        id,
        timestamp,
        COALESCE(ph::numeric, null) as ph,
        COALESCE(temperature::numeric, null) as temperature,
        COALESCE(turbidity::integer, null) as turbidity,
        COALESCE(water_level::numeric, null) as water_level,
        COALESCE(battery_level::numeric, null) as battery_level,
        error_code
      FROM measurements 
      WHERE ${timeFilter} 
      ORDER BY timestamp DESC`
    );
    
    // Process water level for each measurement
    const processedRows = await Promise.all(results.rows.map(async (row) => {
      if (row.water_level !== null) {
        row.water_level = await calculateWaterLevelPercentage(row.water_level);
      }
      return row;
    }));
    
    res.json(processedRows);
  } catch (error) {
    console.error('Error in GET /api/measurements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modify the GET health endpoint
app.get('/api/health', async (req, res) => {
  try {
    const measurementsResult = await pool.query(
      `SELECT 
        id,
        timestamp,
        COALESCE(ph::numeric, null) as ph,
        COALESCE(temperature::numeric, null) as temperature,
        COALESCE(turbidity::integer, null) as turbidity,
        COALESCE(water_level::numeric, null) as water_level,
        COALESCE(battery_level::numeric, null) as battery_level,
        error_code
      FROM measurements 
      ORDER BY timestamp DESC 
      LIMIT 1`
    );

    const fishSpeciesResult = await pool.query('SELECT * FROM fish_species');

    if (measurementsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhuma medição encontrada' });
    }

    if (measurementsResult.rows.length > 0 && measurementsResult.rows[0].water_level !== null) {
      measurementsResult.rows[0].water_level = await calculateWaterLevelPercentage(
        measurementsResult.rows[0].water_level
      );
    }

    const health = calculateHealth(measurementsResult.rows[0], fishSpeciesResult.rows, true);
    res.json(health);
  } catch (error) {
    console.error('Erro no GET /api/health:', error);
    res.status(500).json({ error: error.message });
  }
});
// Fish Management Endpoints
app.get('/api/fish', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aquarium_fish ORDER BY added_date DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all species
app.get('/api/fish/parameters', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fish_species ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new fish
app.post('/api/fish', async (req, res) => {
  try {
    const { name, species_id, notes } = req.body;
    
    // Validate required fields
    if (!name || !species_id) {
      return res.status(400).json({ error: 'Name and species are required' });
    }

    const result = await pool.query(
      'INSERT INTO aquarium_fish (name, species_id, notes) VALUES ($1, $2, $3) RETURNING *',
      [name, species_id, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new species
app.post('/api/fish/parameters', async (req, res) => {
  try {
    const { 
      name, 
      scientific_name, 
      min_ph, 
      max_ph, 
      min_temp, 
      max_temp 
    } = req.body;

    // Validate required fields
    if (!name || !scientific_name || !min_ph || !max_ph || !min_temp || !max_temp) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate ranges
    if (min_ph > max_ph) {
      return res.status(400).json({ error: 'Minimum pH cannot be greater than maximum pH' });
    }
    if (min_temp > max_temp) {
      return res.status(400).json({ error: 'Minimum temperature cannot be greater than maximum temperature' });
    }

    const result = await pool.query(
      `INSERT INTO fish_species 
       (name, scientific_name, min_ph, max_ph, min_temp, max_temp) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, scientific_name, min_ph, max_ph, min_temp, max_temp]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete fish
app.delete('/api/fish/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM aquarium_fish WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fish not found' });
    }

    res.json({ message: 'Fish removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete species (only if no fish are using it)
app.delete('/api/fish/parameters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if any fish are using this species
    const checkResult = await pool.query(
      'SELECT COUNT(*) FROM aquarium_fish WHERE species_id = $1',
      [id]
    );

    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete species that has fish associated with it' 
      });
    }

    const result = await pool.query(
      'DELETE FROM fish_species WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Species not found' });
    }

    res.json({ message: 'Species removed successfully' });
  } catch (error) {
    res.status (500).json({ error: error.message });
  }
});

// Add this new endpoint before the error handling middleware
app.get('/api/parameters/ranges', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        MIN(min_ph) as min_ph,
        MIN(max_ph) as max_ph,
        MIN(min_temp) as min_temp,
        MIN(max_temp) as max_temp
      FROM fish_species
    `);
    
    if (result.rows.length === 0) {
      return res.json({
        ph: "6.5-7.5",
        temperature: "24-26°C",
        turbidity: "<10 NTU",
        water_level: ">90%"
      });
    }

    const ranges = {
      ph: `${result.rows[0].min_ph}-${result.rows[0].max_ph}`,
      temperature: `${result.rows[0].min_temp}-${result.rows[0].max_temp}°C`,
      turbidity: "<10 NTU",
      water_level: ">90%"
    };

    res.json(ranges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tank/dimensions', async (req, res) => {
  try {
    const { length, width, height, sensor_offset } = req.body;

    // Validate required fields
    if (!length || !width || !height || !sensor_offset) {
      return res.status(400).json({ error: 'All dimensions are required' });
    }

    // Calculate area and volume
    const area = length * width;
    const volume = area * height;

    const result = await pool.query(
      `INSERT INTO tank_dimensions 
       (length, width, height, sensor_offset) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [length, width, height, sensor_offset]
    );

    // Add calculated values to response
    const response = {
      ...result.rows[0],
      area: area,
      volume: volume
    };

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tank/dimensions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tank_dimensions ORDER BY created_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No tank dimensions found' });
    }

    // Calculate area and volume
    const dimensions = result.rows[0];
    const area = dimensions.length * dimensions.width;
    const volume = area * dimensions.height;

    const response = {
      ...dimensions,
      area: area,
      volume: volume
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
async function performHealthCheck() {
  try {
    const measurementsResult = await pool.query(
      `SELECT 
        id,
        timestamp,
        COALESCE(ph::numeric, null) as ph,
        COALESCE(temperature::numeric, null) as temperature,
        COALESCE(turbidity::integer, null) as turbidity,
        COALESCE(water_level::numeric, null) as water_level,
        COALESCE(battery_level::numeric, null) as battery_level,
        error_code
      FROM measurements 
      ORDER BY timestamp DESC 
      LIMIT 1`
    );

    const fishSpeciesResult = await pool.query('SELECT * FROM fish_species');

    if (measurementsResult.rows.length === 0) {
      console.log('No measurements found for health check');
      return;
    }

    if (measurementsResult.rows[0].water_level !== null) {
      measurementsResult.rows[0].water_level = await calculateWaterLevelPercentage(
        measurementsResult.rows[0].water_level
      );
    }

    calculateHealth(measurementsResult.rows[0], fishSpeciesResult.rows, false);
  } catch (error) {
    console.error('Error in periodic health check:', error);
  }
}
// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});
// Start periodic health check (every 5 minutes)
const HEALTH_CHECK_INTERVAL = 15000; // 5 minutes in milliseconds
setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);

// Initialize database and start server
const PORT = 3002;
app.set('port', PORT); 
app.listen(PORT, () => {
  initDB();
  performHealthCheck(); // Run initial health check

  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;