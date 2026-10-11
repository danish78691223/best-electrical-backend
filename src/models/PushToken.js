import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  token:{type:String,required:true,unique:true},
  platform:{type:String,default:'android'},
  enabled:{type:Boolean,default:true},
  lastRegisteredAt:{type:Date,default:Date.now}
},{timestamps:true});
export default mongoose.models.PushToken || mongoose.model('PushToken',schema);
