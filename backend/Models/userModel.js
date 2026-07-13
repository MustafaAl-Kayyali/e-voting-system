const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    Id: {
        type:Number,
        required:true
    },

    name: {
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true
    },
    phone:{
        type:Number,
        required:true
    },
    DOB:{
        type:Date,
        required:true
    },
    electoralDistrict:{
        type:String,
        required:true
    },
    password:{
        type:String,
        required:true
    },
    role:{
        type:String,
        required:true
    }
})


module.exports = mongoose.model("User", userSchema)