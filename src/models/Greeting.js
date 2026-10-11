import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  title:{type:String,required:true},
  message:{type:String,required:true},
  occasion:{type:String,default:'Daily Greeting'},
  active:{type:Boolean,default:true}
},{timestamps:true});
export default mongoose.models.Greeting || mongoose.model('Greeting',schema);
