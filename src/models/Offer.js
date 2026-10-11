import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  title:{type:String,required:true}, description:{type:String,default:''},
  discount:{type:String,default:''}, active:{type:Boolean,default:true}, festival:{type:String,default:'General'}
},{timestamps:true});
export default mongoose.models.Offer || mongoose.model('Offer',schema);
