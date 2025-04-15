const express = require("express");
const mongoose = require("mongoose");
const app = express();
const dotEnv = require('dotenv');
const rateLimit = require('express-rate-limit');
dotEnv.config();
app.use(express.json());
const { v4: uuidv4 } = require('uuid');
const xssClean = require('xss-clean');
app.use(xssClean());
const port = process.env.PORT;
require('dotenv').config();
const {checkApiKey}=require('./api.js')

mongoose.connect(process.env.DB_HOST)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Could not connect to MongoDB', err));
  const theaterSchema = new mongoose.Schema({
    id: String,
    name: String,
    location: {
      address_line: String,
      city: String,
      state: String,
      pincode: String
    },
    amenities: {
      facilities: [String]
    },
    movies: [
      {
        id: { type: String, required: true },
        title: String,
        genre: String,
        duration: Number,
        showtimes: [
          {
            date: String,
            day: String, 
            times: [
              {
                time: String, 
                seating_layout: [
                  {
                    row: String,
                    seats: [
                      {
                        number: String,
                        category: { type: String, enum: ['balcony', 'firstclass', 'secondclass'] },
                        price: Number,
                        available: { type: Boolean, default: true }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        rating: String,
        description: String,
        poster: String,
        start_date: Date,
        end_date: Date,
        language: { type: String, required: true }
      }
    ],
    seating_layout: [
      {
        row: String,
        seats: [
          {
            number: String,
            category: { type: String, enum: ['balcony', 'firstclass', 'secondclass'] },
            price: Number,
            available: { type: Boolean, default: true }
          }
        ]
      }
    ]
  });
const Theater = mongoose.model('Theater', theaterSchema);

app.get('/',(req,res)=>{
  return res.json('Welcome to ShoreTic API')
})

//theater by ID
app.get("/theater/:id", async (req, res) => {
    const { id } = req.params;
  
    try {
      const theater = await Theater.findOne({ id: id },{amenities:0,_id:0,'movies.showtimes.seating_layout':0,seating_layout:0,_id:0,__v:0,'movies._id':0});
  
      if (!theater) {
        return res.status(404).json({ message: "Theater not found with the given ID." });
      }
      res.json(theater);
    } catch (err) {
      res.status(500).json({ message: "Error fetching the theater." });
    }
  });

//To get the theater
app.get("/theater", async (req, res) => {
  try {
    const theaters = await Theater.find({},{amenities:0,_id:0,movies:0,seating_layout:0,__v:0});
    res.json(theaters);
  } catch (err) {
    res.status(500).json({ message: "Error fetching theaters." });
  }
});

// Endpoint to search theaters by city and title of the movie
app.get("/search", async (req, res) => {
  const { city, title, language, date } = req.query;
  
  // If no city is provided, return a 400 error
  if (!city) {
    return res.status(400).json({ message: "Please provide a city to search." });
  }
  
  try {
    // Search theaters based on city location, ignoring unnecessary fields
    const theaters = await Theater.find(
      { 'location.city': city },
      {
        amenities: 0,
        _id: 0,
        seating_layout: 0,
        __v: 0,
        'movies._id': 0,
        'movies.showtimes.times.seating_layout': 0,
        'movies.showtimes.times._id': 0,
        'movies.showtimes._id': 0
      }
    );
    
    // If no theaters are found in the city
    if (theaters.length === 0) {
      return res.status(404).json({ message: "No theater found for the given city." });
    }
    
    // If filters are provided, process them
    if (title || language || date) {
      const filteredTheaters = theaters.map(theater => {
        let filteredMovies = theater.movies;

        // Filter by movie title if provided
        if (title) {
          filteredMovies = filteredMovies.filter(movie =>
            movie.title.toLowerCase().includes(title.toLowerCase())
          );
        }
        
        // Filter by language if provided
        if (language) {
          filteredMovies = filteredMovies.filter(movie =>
            movie.language.toLowerCase() === language.toLowerCase()
          );
        }
        
        // Filter by date if provided
        if (date) {
          filteredMovies = filteredMovies.filter(movie => {
            // Check if any of the movie's showtimes match the requested date
            return movie.showtimes.some(showtime => showtime.date === date);
          });
          
          // Filter the showtimes to only include those on the specified date
          filteredMovies = filteredMovies.map(movie => {
            const filteredShowtimes = movie.showtimes.filter(showtime => showtime.date === date);
            return { ...movie.toObject(), showtimes: filteredShowtimes };
          });
        }
        
        return { ...theater.toObject(), movies: filteredMovies };
      });
      
      // Remove theaters with no matching movies
      const theatersWithMovies = filteredTheaters.filter(theater => theater.movies.length > 0);
      
      if (theatersWithMovies.length === 0) {
        let message = "No movies found";
        const filters = [];
        
        if (title) filters.push(`title containing "${title}"`);
        if (language) filters.push(`in ${language} language`);
        if (date) filters.push(`on date ${date}`);
        
        if (filters.length > 0) {
          message += ` with ${filters.join(' and ')}`;
        }
        
        message += " in the specified city.";
        return res.status(404).json({ message });
      }
      
      // Return the filtered theaters with movies
      res.json(theatersWithMovies);
    } else {
      // If no filters are provided, return all theaters in the city
      res.json(theaters);
    }
  } catch (err) {
    console.error("Error searching theaters:", err);
    res.status(500).json({ message: "Error searching theaters." });
  }
});



// Endpoint to add a new theater
app.post("/admin/theater" ,async (req, res) => {
  const { id, name, location, amenities } = req.body;
  if (!id || !name || !location || !location.city || !location.state || !location.pincode) {
    return res.status(400).json({ message: "Missing required fields for theater details." });
  }
  try {
    const existingTheater = await Theater.findOne({ id });

    if (existingTheater) {
      return res.status(400).json({ message: "A theater with this ID already exists." });
    }
    const newTheater = new Theater({
      id,
      name,
      location,
      amenities,
      movies: []
    });
    const savedTheater = await newTheater.save();
    res.status(201).json(savedTheater);
  } catch (err) {
    res.status(500).json({ message: "Error adding theater." });
  }
});

// Helper function to generate dates between start and end date
function generateDatesBetween(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= new Date(endDate)) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  }
  
  // Helper function to format date to dd-mm-yyyy
  function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  
  // Helper function to parse date from dd-mm-yyyy format
  function parseDate(dateString) {
    const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));
    // Note: month - 1 because JavaScript months are 0-based
    return new Date(year, month - 1, day);
  }
  
// Endpoint to add movie details to a specific theater by ID
app.post("/admin/theater/:id/movie", async (req, res) => {
  const { id } = req.params;
  const { 
    title, 
    genre, 
    duration, 
    showtimes, // Array of time strings like ["10:00 AM", "2:00 PM"]
    rating, 
    description, 
    poster, 
    start_date, 
    end_date, 
    language 
  } = req.body;

  // Validation checks
  if (!title || !genre || !duration || !showtimes || !rating || 
      !description || !poster || !start_date || !end_date || !language) {
    return res.status(400).json({ 
      message: "Missing required fields for movie details." 
    });
  }

  // Validate showtimes array
  if (!Array.isArray(showtimes) || showtimes.some(time => typeof time !== "string")) {
    return res.status(400).json({ 
      message: "Showtimes must be an array of strings." 
    });
  }

  try {
    const theater = await Theater.findOne({ id: id });

    if (!theater) {
      return res.status(404).json({ 
        message: "Theater not found with the given ID." 
      });
    }

    // Check if theater has seating layout
    if (!theater.seating_layout || theater.seating_layout.length === 0) {
      return res.status(400).json({
        message: "Theater does not have a seating layout configured."
      });
    }

    // Parse dates
    const parsedStartDate = parseDate(start_date);
    const parsedEndDate = parseDate(end_date);

    // Validate dates
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      return res.status(400).json({ 
        message: "Invalid date format. Please use dd-mm-yyyy format." 
      });
    }

    if (parsedStartDate > parsedEndDate) {
      return res.status(400).json({ 
        message: "Start date cannot be after end date." 
      });
    }

    // Generate all dates between start and end date
    const allDates = generateDatesBetween(parsedStartDate, parsedEndDate);

    // Function to generate seating layout for a showtime
    const generateSeatingLayoutForShowtime = () => {
      return theater.seating_layout.map(row => ({
        row: row.row,
        seats: row.seats.map(seat => ({
          number: seat.number,
          category: seat.category,
          price: seat.price,
          available: seat.available
        }))
      }));
    };

    // Generate movie ID
    const movieId = uuidv4();

    // Generate showtimes by date
    const generatedShowtimes = allDates.map(date => {
      const formattedDate = formatDate(date);
      const dayOfWeek = date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    
      return {
        date: formattedDate,
        day: dayOfWeek,
        times: showtimes.map(time => ({
          time: time,
          seating_layout: generateSeatingLayoutForShowtime()
        }))
      };
    });
    

    // Create movie object with generated showtimes
    const movieWithSeating = {
      id: movieId,
      title,
      genre,
      duration,
      showtimes: generatedShowtimes,
      rating,
      description,
      poster,
      start_date: parsedStartDate,
      end_date: parsedEndDate,
      language
    };

    // Add movie to theater
    theater.movies.push(movieWithSeating);
    await theater.save();

    // Calculate total number of showtimes
    const totalShowtimes = generatedShowtimes.reduce((total, dateObj) => total + dateObj.times.length, 0);

    res.status(201).json({
      message: "Movie added successfully",
      movieId: movieId,
      totalShowtimes: totalShowtimes,
      movie: movieWithSeating
    });

  } catch (err) {
    console.error("Error adding movie details:", err);
    res.status(500).json({ 
      message: "Error adding movie details to the theater.",
      error: err.message 
    });
  }
});

//general theater seating layout
app.post("/admin/theater/:id/seating", async (req, res) => {
  const { id } = req.params;
  const { seating_layout } = req.body;
  // Validate seating_layout structure
  if (!Array.isArray(seating_layout) || seating_layout.some(row => !row.row || !Array.isArray(row.seats))) {
    return res.status(400).json({ message: "Invalid seating layout format. Each row should have a 'row' and 'seats' array." });
  }
  // Validate each seat in the seating layout
  seating_layout.forEach(row => {
    row.seats.forEach(seat => {
      if (!seat.number || !seat.category || !seat.price) {
        return res.status(400).json({ message: "Each seat must have a number, category, and price." });
      }
      // Validate seat category
      const validCategories = ['balcony', 'firstclass', 'secondclass'];
      if (!validCategories.includes(seat.category)) {
        return res.status(400).json({ message: `Invalid category. Valid categories are: ${validCategories.join(', ')}.` });
      }
    });
  });
  try {
    // Find the theater by ID
    const theater = await Theater.findOne({ id: id });
    // If the theater doesn't exist, return 404
    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }
    // Update the seating layout for the theater
    theater.seating_layout = seating_layout;
    // Save the updated theater
    const updatedTheater = await theater.save();
    res.status(201).json(updatedTheater);
  } catch (err) {
    console.error("Error adding seating layout:", err);
    res.status(500).json({ message: "Error adding seating layout to the theater." });
  }
});

//Rate Limiter for Updating Seats for Specific Show Time
const bookingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 10, 
  message: 'Too many booking attempts from this IP, please try again later.'
});

app.put("/admin/theater/:id/movie/:movieId/showtime/:showtime",checkApiKey,bookingLimiter,async (req, res) => {
  const { id, movieId, showtime } = req.params;
  const { row, seatNumber, available } = req.body;
  if (typeof available !== 'boolean') {
    return res.status(400).json({ message: "'available' should be a boolean value." });
  }
  try {
    // Find the theater by ID
    const theater = await Theater.findOne({ id });
    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }

    // Find the movie by its ID
    const movieIndex = theater.movies.findIndex(movie => movie.id === movieId);

    if (movieIndex === -1) {
      return res.status(404).json({ message: "Movie not found with the given ID." });
    }

    // Find the specific showtime in the movie
    const showtimeIndex = theater.movies[movieIndex].showtimes.findIndex(s => s.time === showtime);

    if (showtimeIndex === -1) {
      return res.status(404).json({ message: "Showtime not found." });
    }

    // Find the specific row in the showtime seating layout
    const rowIndex = theater.movies[movieIndex].showtimes[showtimeIndex].seating_layout.findIndex(r => r.row === row);

    if (rowIndex === -1) {
      return res.status(404).json({ message: "Row not found in the seating layout." });
    }

    // Find the specific seat in the row
    const seatIndex = theater.movies[movieIndex].showtimes[showtimeIndex].seating_layout[rowIndex].seats.findIndex(s => s.number === seatNumber);

    if (seatIndex === -1) {
      return res.status(404).json({ message: "Seat not found in the row." });
    }

    // Update seat availability using direct path and $set operator
    const updatePath = `movies.${movieIndex}.showtimes.${showtimeIndex}.seating_layout.${rowIndex}.seats.${seatIndex}.available`;
    
    const result = await Theater.updateOne(
      { id: id },
      { $set: { [updatePath]: available } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "Seat availability could not be updated." });
    }

    res.status(200).json({ message: "Seat availability updated successfully." });
  } catch (err) {
    console.error("Error updating seat availability:", err);
    res.status(500).json({ message: "Error updating seat availability." });
  }
});

// Endpoint to get the seating layout for a specific movie showtime
app.get("/theater/:id/movie/:movieId/showtime", async (req, res) => {
  const { id, movieId } = req.params;
  const { date, time } = req.query;
  
  if (!date || !time) {
    return res.status(400).json({ message: "Both date (dd-mm-yyyy) and time are required." });
  }
  
  try {
    // Find the theater by ID
    const theater = await Theater.findOne({id},{_id:0,'seating_layout.seats':0});

    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }
    
    // Find the movie by its ID
    const movie = theater.movies.find(movie => movie.id === movieId);
    if (!movie) {
      return res.status(404).json({ message: "Movie not found with the given ID." });
    }
    
    // Find the date object
    const dateObject = movie.showtimes.find(d => d.date === date);
    if (!dateObject) {
      return res.status(404).json({ message: "No showtimes found for the specified date." });
    }
    
    // Find the specific time slot
    const timeObject = dateObject.times.find(t => t.time === time);
    if (!timeObject) {
      return res.status(404).json({ message: "Showtime not found for the specified time." });
    }
    
    // Return the seating layout for the specific showtime
    res.json({
      movieId: movieId,
      date: date,
      time: time,
      seating_layout: timeObject.seating_layout
    });
  } catch (err) {
    console.error("Error fetching seating layout:", err);
    res.status(500).json({ message: "Error fetching seating layout." });
  }
});



//Endpoint To Delete Movie From Specific Theater from by Using ID
app.delete("/admin/theater/:id/movie/:movieId", async (req, res) => {
  const { id, movieId } = req.params;
  try {
    const theater = await Theater.findOne({ id });
    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }
    // Find the movie index
    const movieIndex = theater.movies.findIndex(movie => movie.id === movieId);
    if (movieIndex === -1) {
      return res.status(404).json({ message: "Movie not found with the given ID." });
    }
    // Remove the movie from the array
    theater.movies.splice(movieIndex, 1);
    // Save the updated theater
    const updatedTheater = await theater.save();
    res.status(200).json({ 
      message: "Movie successfully deleted",
      theater: updatedTheater
    });
  } catch (err) {
    console.error("Error deleting movie:", err);
    res.status(500).json({ message: "Error deleting movie from the theater." });
  }
});


// Endpoint to update theater details
app.put("/admin/theater/:id", async (req, res) => {
  const { id } = req.params;
  const { name, location, amenities } = req.body;
  // Validate required fields
  if (!name || !location || !location.city || !location.state || !location.pincode) {
    return res.status(400).json({ message: "Missing required fields for theater details." });
  }
  try {
    const theater = await Theater.findOne({ id });
    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }
    // Update theater details
    theater.name = name;
    theater.location = location;
    if (amenities) {
      theater.amenities = amenities;
    }

    const updatedTheater = await theater.save();
    res.json(updatedTheater);
  } catch (err) {
    console.error("Error updating theater:", err);
    res.status(500).json({ message: "Error updating theater details." });
  }
});

// Endpoint to delete a theater
app.delete("/admin/theater/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const theater = await Theater.findOne({ id });

    if (!theater) {
      return res.status(404).json({ message: "Theater not found with the given ID." });
    }

    await Theater.deleteOne({ id });
    res.json({ message: "Theater successfully deleted" });
  } catch (err) {
    console.error("Error deleting theater:", err);
    res.status(500).json({ message: "Error deleting theater." });
  }
});


app.listen(port, () => {
  console.log(`Server started and listening on ${port}`);
});



