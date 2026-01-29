const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(`mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.o8so70l.mongodb.net/?appName=Cluster0`)
  .then(() => console.log("MongoDB Connected via Mongoose"))
  .catch(err => console.log(err));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  profilePicture: { type: String, default: '' },
});
const User = mongoose.model('User', userSchema);

const recipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  cuisine: { type: String, required: true },
  ingredients: { type: [String], required: true },
  instructions: { type: String, required: true },
  calories: Number,
  image: String,
  cookingTime: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Recipe = mongoose.model('Recipe', recipeSchema);

const mealPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  date: { type: Date, required: true },
  dayOfWeek: { type: String, required: true },
  email: { type: String, required: true },
  status: {
    type: String,
    enum: ['Planned', 'Cooking', 'Cooked'],
    default: 'Planned'
  },
  createdAt: { type: Date, default: Date.now }
});
const MealPlan = mongoose.model('MealPlan', mealPlanSchema);

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
})
const Category = mongoose.model('Category', categorySchema);


// const verifyToken = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];

//   if (!token) {
//     return res.status(401).json({ message: "Access Denied. No token provided." });
//   }

//   try {
//     const verified = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = verified;
//     next();
//   } catch (err) {
//     res.status(400).json({ message: "Invalid Token" });
//   }
// };

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("Auth Header:", authHeader);
  if (!authHeader) return res.status(401).json({ error: "No token" });

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: { name: newUser.name, role: newUser.role }
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, id: user._id, user: { name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/users/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select("-password");
  res.json(user);
});

app.post("/meal-plans", async (req, res) => {
  try {
    const plans = req.body;

    if (!Array.isArray(plans) || plans.length === 0) {
      return res.status(400).json({ message: "No meal plans provided" });
    }

    const result = await MealPlan.insertMany(plans);

    res.status(201).json({
      message: "Meal plans saved successfully",
      data: result
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get('/meal-plans', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const mealPlans = await MealPlan.find({ email })
      .populate('recipeId')
      .sort({ date: 1 });

    const formattedPlans = mealPlans.map(plan => ({
      _id: plan._id,
      recipe: plan.recipeId,
      date: plan.date,
      dayOfWeek: plan.dayOfWeek,
      status: plan.status
    }));

    res.json(formattedPlans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/categories", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const formattedName = name.trim().toLowerCase();

    const existingCategory = await Category.findOne({ name: formattedName });
    if (existingCategory) {
      return res.status(409).json({ message: "Category already exists" });
    }

    const newCategory = new Category({
      name: formattedName,
    });

    const savedCategory = await newCategory.save();

    res.status(201).json(savedCategory);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ message: "Failed to create category" });
  }
});


app.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

app.delete("/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const isUsed = await Recipe.findOne({ category: category.name });
    if (isUsed) {
      return res.status(409).json({
        message: "Category is used in recipes. Cannot delete."
      });
    }

    await Category.findByIdAndDelete(id);

    res.status(200).json({
      message: "Category deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});




app.get('/', (req, res) => res.send('TasteTrail Server is running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));