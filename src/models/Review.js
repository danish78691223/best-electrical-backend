import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name:{type:String,required:true}, rating:{type:Number,min:1,max:5,required:true},
  text:{type:String,required:true}, approved:{type:Boolean,default:false}
},{timestamps:true});
export default mongoose.models.Review || mongoose.model('Review',schema);
