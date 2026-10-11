import express from 'express';
import cors from 'cors';
import { mongoReady } from './config/db.js';
import Product from './models/Product.js';
import Review from './models/Review.js';
import Offer from './models/Offer.js';
import Greeting from './models/Greeting.js';
import PushToken from './models/PushToken.js';
import { products as demoProducts, offers as demoOffers, reviews as demoReviews, enquiries, greetings as demoGreetings, pushTokens } from './data/demo.js';
import { sendPushToAll } from './services/pushNotifications.js';

const app = express();
app.use(cors());
app.use(express.json({limit:'1mb'}));
let nextId = 100;
const id = p => `${p}${nextId++}`;
const useMongo = () => mongoReady();
const toPlain = x => ({...x.toObject?.() ?? x, id:String(x._id || x.id), _id:undefined, __v:undefined});

app.get('/api/health',(req,res)=>res.json({ok:true,service:'BEST ELECTRICAL API',database:useMongo()?'MongoDB':'demo-memory'}));

app.get('/api/products',async(req,res)=>{
 try {
  if(useMongo()){let rows=await Product.find({active:true}).sort({createdAt:-1});return res.json(rows.map(toPlain));}
  res.json(demoProducts);
 } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/products',async(req,res)=>{
 const {name,category,price,stock,description}=req.body;
 if(!name || !Number.isFinite(Number(price))) return res.status(400).json({error:'Product name and valid price are required.'});
 try {
  if(useMongo()){const row=await Product.create({name,category,price:Number(price),stock:Number(stock||0),description});return res.status(201).json(toPlain(row));}
  const row={id:id('p'),name,category:category||'Electrical',price:Number(price),stock:Number(stock||0),description:description||''};demoProducts.unshift(row);res.status(201).json(row);
 }catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/offers',async(req,res)=>{
 try {if(useMongo()) return res.json((await Offer.find({active:true})).map(toPlain));res.json(demoOffers.filter(x=>x.active));}
 catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/offers',async(req,res)=>{
 const {title,festival,discount,description}=req.body;
 if(!title)return res.status(400).json({error:'Offer title is required.'});
 try {
  let row;
  if(useMongo()){row=await Offer.create({title,festival,discount,description});row=toPlain(row);}
  else {row={id:id('o'),title,festival:festival||'General',discount:discount||'',description:description||'',active:true,createdAt:new Date().toISOString()};demoOffers.unshift(row);}
  const push = await sendPushToAll({title:`BEST ELECTRICAL: ${row.title}`,body:[row.discount,row.description].filter(Boolean).join(' — ')||'A new offer is available.',data:{type:'offer',id:row.id}});
  res.status(201).json({offer:row,push,message:push.registered ? `Offer published. Push notification sent to ${push.sent} device(s).` : 'Offer published. No push devices are registered yet.'});
 }catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/greetings',async(req,res)=>{
 try {if(useMongo()) return res.json((await Greeting.find({active:true}).sort({createdAt:-1})).map(toPlain));res.json(demoGreetings.filter(x=>x.active));}
 catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/greetings',async(req,res)=>{
 const {title,message,occasion}=req.body;
 if(!title?.trim()||!message?.trim())return res.status(400).json({error:'Greeting title and message are required.'});
 try {
  let row;
  if(useMongo()){row=toPlain(await Greeting.create({title:title.trim(),message:message.trim(),occasion:occasion||'Daily Greeting'}));}
  else {row={id:id('g'),title:title.trim(),message:message.trim(),occasion:occasion||'Daily Greeting',active:true,createdAt:new Date().toISOString()};demoGreetings.unshift(row);}
  const push=await sendPushToAll({title:`BEST ELECTRICAL · ${row.title}`,body:row.message,data:{type:'greeting',id:row.id}});
  res.status(201).json({greeting:row,push,message:push.registered?`Greeting published. Push notification sent to ${push.sent} device(s).`:'Greeting published. No push devices are registered yet.'});
 }catch(e){res.status(400).json({error:e.message});}
});

app.post('/api/push/register',async(req,res)=>{
 const {token,platform='android'}=req.body||{};
 if(typeof token!=='string'||!token.startsWith('ExponentPushToken['))return res.status(400).json({error:'A valid Expo push token is required.'});
 try {
  if(useMongo()){await PushToken.findOneAndUpdate({token},{token,platform,enabled:true,lastRegisteredAt:new Date()},{upsert:true,new:true,setDefaultsOnInsert:true});}
  else {const existing=pushTokens.find(x=>x.token===token);if(existing){existing.platform=platform;existing.lastRegisteredAt=new Date().toISOString();}else pushTokens.push({token,platform,lastRegisteredAt:new Date().toISOString()});}
  res.status(201).json({ok:true,message:'Push token registered.'});
 }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/push/test',async(req,res)=>{
 const result=await sendPushToAll({title:'BEST ELECTRICAL',body:'Notifications are set up on this device.',data:{type:'test'}});
 res.json({ok:true,push:result});
});

app.get('/api/reviews',async(req,res)=>{
 try {if(useMongo()){const rows=await Review.find({approved:true}).sort({createdAt:-1});return res.json(rows.map(toPlain));}res.json(demoReviews.filter(x=>x.approved));}
 catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/reviews',async(req,res)=>{
 const {name,rating,text}=req.body;
 if(!name || !text || Number(rating)<1 || Number(rating)>5)return res.status(400).json({error:'Name, review text and rating from 1 to 5 are required.'});
 try {if(useMongo()){const row=await Review.create({name,rating:Number(rating),text,approved:false});return res.status(201).json({message:'Review submitted for approval.',review:toPlain(row)});}
 const row={id:id('r'),name,rating:Number(rating),text,approved:false};demoReviews.unshift(row);res.status(201).json({message:'Review submitted for approval.',review:row});}
 catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/admin/reviews',async(req,res)=>{
 try {if(useMongo())return res.json((await Review.find().sort({createdAt:-1})).map(toPlain));res.json(demoReviews);}
 catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/admin/reviews/:id',async(req,res)=>{
 const approved=Boolean(req.body.approved);
 try {if(useMongo()){const row=await Review.findByIdAndUpdate(req.params.id,{approved},{new:true});if(!row)return res.status(404).json({error:'Review not found'});return res.json(toPlain(row));}
 const row=demoReviews.find(x=>x.id===req.params.id);if(!row)return res.status(404).json({error:'Review not found'});row.approved=approved;res.json(row);}
 catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/enquiries', (req,res)=>{
 const {name,phone,items,message}=req.body;
 if(!name || !phone)return res.status(400).json({error:'Name and phone are required.'});
 const row={id:id('e'),name,phone,items:items||[],message:message||'',status:'New',createdAt:new Date().toISOString()};
 enquiries.unshift(row);res.status(201).json({message:'Enquiry saved in this server session.',enquiry:row});
});
app.get('/api/admin/enquiries',(req,res)=>res.json(enquiries));
export default app;
