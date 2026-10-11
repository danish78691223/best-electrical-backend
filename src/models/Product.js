import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name:{type:String,required:true}, category:{type:String,default:'Electrical'},
  price:{type:Number,required:true,min:0}, stock:{type:Number,default:0,min:0},
  description:{type:String,default:''}, image:{type:String,default:''}, active:{type:Boolean,default:true}
},{timestamps:true});
export default mongoose.models.Product || mongoose.model('Product',schema);
