function checkApiKey(req, res, next) {
  const apiKey = req.query.apikey || req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ message: 'Invalid API Key' });
  }

  next();  
}

module.exports={checkApiKey}