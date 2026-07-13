const User = require("../Models/userModel");
const dcriptpassword = require("bcryptjs");
const jwt = require('jsonwebtoken');

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '24h'
    });
};

exports.signup = async (req, res) => {
    const { Id, name, email, phone, DOB, electoralDistrict, password, confirmPassword, role } = req.body;
    
    if (!Id || !name || !email || !phone || !DOB || !electoralDistrict || !password || !role) {
        return res.status(400).json({ message: "All fields are required" });
    }
    if (password != confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
    }
    
    const existingUser = await User.findOne({ Id });
    if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
    }
    
    if (role != 'admin' && role != 'voter') {
        return res.status(400).json({ message: "Invalid role" });
    }
    
    if (DOB > "2008-12-31") {
        return res.status(400).json({ message: "You are not old enough to vote" });
    }
    
    const cryptpassword = await dcriptpassword.hash(password, 12);
    
    if (role === "voter") {
        const voter = await User.create({
            Id,
            name,
            email,
            phone,
            DOB,
            electoralDistrict,
            password: cryptpassword,
            role
        })
        const token = signToken(voter._id);
        return res.status(201).json({ token, voter });
    }
    else if (role === "admin") {
        const admin = await User.create({
            Id,
            name,
            email,
            phone,
            DOB,
            electoralDistrict,
            password: cryptpassword,
            role
        })
        const token = signToken(admin._id);
        return res.status(201).json({ token, admin });
    }
}

exports.login = async (req, res) => {
    const body = req.body || {};
    const identifier = body.identifier ?? body.Id ?? body.email ?? body.nationalId;
    const { password } = body;

    if (!identifier || !password) {
        return res.status(400).json({ message: "Email, national ID, or user ID and password are required" });
    }

    const idAsNumber = Number(identifier);
    const query = Number.isFinite(idAsNumber) && String(idAsNumber) === String(identifier).trim()
        ? { Id: idAsNumber }
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(identifier).trim())
            ? { email: String(identifier).trim().toLowerCase() }
            : null;

    if (!query) {
        return res.status(400).json({
            message: "Use a numeric user ID or email for legacy /users/login. Voters should use /api/auth/login/voter."
        });
    }

    const user = await User.findOne(query).select("+password");
    if (!user) {
        return res.status(401).json({ message: "Incorrect ID/email or password" });
    }
    const isPasswordValid = await dcriptpassword.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: "Incorrect ID/email or password" });
    }
    const token = signToken(user._id);
    return res.status(200).json({ token, user });
};