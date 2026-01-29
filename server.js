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

const recipeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, required: true }, // Breakfast, Lunch, Dinner
    cuisine: { type: String, required: true }, // Italian, Indian, Bangla
    ingredients: { type: [String], required: true },
    instructions: { type: String, required: true },
    calories: { type: Number },
    cookingTime: { type: String },
    image: { type: String, required: false, default: "" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

const Recipe = mongoose.model("Recipe", recipeSchema);


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

const savedRecipeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true,
    },
  },
  { timestamps: true }
);

const SavedRecipe = mongoose.model("SavedRecipe", savedRecipeSchema);



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
    const { name, email, password, profilePicture } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      profilePicture
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: {
        name: newUser.name,
        role: newUser.role,
        profilePicture: newUser.profilePicture
      },
    });

  } catch (err) {
    console.error(err);
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

app.patch("/meal-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meal plan ID" });
    }

    const allowedStatus = ["Planned", "Cooking", "Cooked"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const mealPlan = await MealPlan.findById(id);
    if (!mealPlan) {
      return res.status(404).json({ message: "Meal plan not found" });
    }

    mealPlan.status = status;
    await mealPlan.save();

    res.status(200).json({
      message: "Status updated successfully",
      mealPlan,
    });
  } catch (error) {
    console.error("Error updating meal plan status:", error);
    res.status(500).json({ message: "Failed to update status" });
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


app.post("/recipes", async (req, res) => {
  try {
    const recipeData = req.body;

    const newRecipe = new Recipe({
      ...recipeData
    });

    await newRecipe.save();

    res.status(201).json({
      message: "Recipe added successfully",
      recipe: newRecipe,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add recipe" });
  }
});

app.get("/recipes", async (req, res) => {
  try {
    const recipes = await Recipe.find().sort({ createdAt: -1 });
    res.status(200).json(recipes);
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).json({ message: "Failed to fetch recipes" });
  }
});


app.get("/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid recipe ID" });
    }

    const recipe = await Recipe.findById(id);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    res.status(200).json(recipe);
  } catch (error) {
    console.error("Error fetching recipe by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.delete("/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid recipe ID" });
    }

    const recipe = await Recipe.findById(id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    await Recipe.findByIdAndDelete(id);

    res.status(200).json({ message: "Recipe deleted successfully" });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    res.status(500).json({ message: "Failed to delete recipe" });
  }
});

app.patch("/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid recipe ID" });
    }

    const recipe = await Recipe.findById(id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    Object.keys(updatedData).forEach((key) => {
      recipe[key] = updatedData[key];
    });

    await recipe.save();

    res.status(200).json({
      message: "Recipe updated successfully",
      recipe,
    });
  } catch (error) {
    console.error("Error updating recipe:", error);
    res.status(500).json({ message: "Failed to update recipe" });
  }
});

app.patch("/recipes/:id/assign-category", async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid recipe ID" });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ message: "Category is required" });
    }

    const recipe = await Recipe.findById(id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    recipe.category = category.trim().toLowerCase();
    await recipe.save();

    res.status(200).json({
      message: "Category assigned successfully",
      recipe,
    });
  } catch (error) {
    console.error("Error assigning category:", error);
    res.status(500).json({ message: "Failed to assign category" });
  }
});

app.post("/saved-recipes", authMiddleware, async (req, res) => {
  try {
    const { recipeId } = req.body;
    const userId = req.userId;

    if (!recipeId) {
      return res.status(400).json({ message: "Recipe ID required" });
    }

    const alreadySaved = await SavedRecipe.findOne({ userId, recipeId });

    if (alreadySaved) {
      return res.status(400).json({ message: "Already saved" });
    }

    const saved = await SavedRecipe.create({ userId, recipeId });

    res.status(201).json(saved);
  } catch (error) {
    console.error("Save recipe error:", error);
    res.status(500).json({ message: "Failed to save recipe" });
  }
});

app.get("/saved-recipes", authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const savedRecipes = await SavedRecipe.find({ userId }).populate("recipeId");
    res.send(savedRecipes);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server Error" });
  }
});

app.delete("/saved-recipes/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const savedRecipe = await SavedRecipe.findOne({ _id: id, userId });
    if (!savedRecipe) {
      return res.status(404).send({ message: "Saved recipe not found" });
    }

    await SavedRecipe.deleteOne({ _id: id });
    res.send({ message: "Recipe removed from your cookbook" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});


app.get('/', (req, res) => res.send('TasteTrail Server is running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));