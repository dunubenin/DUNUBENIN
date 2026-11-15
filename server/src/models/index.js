import mongoose from 'mongoose';
const {Schema,model}=mongoose;
const userSchema=new Schema({name:{type:String,required:true,trim:true},email:{type:String,lowercase:true,trim:true},phone:{type:String,trim:true},passwordHash:{type:String,required:true},profileImage:{type:String,default:''},passwordResetTokenHash:{type:String,default:''},passwordResetExpiresAt:{type:Date},role:{type:String,enum:['client','restaurant','rider','master','admin','finance'],default:'client'},status:{type:String,enum:['pending','active','suspended'],default:'active'},city:{type:String,default:'Cotonou'},masterCities:{type:[String],default:[]},deliveryZone:{type:String,trim:true,default:''},restaurantId:{type:Schema.Types.ObjectId,ref:'Restaurant'},lastSeen:Date,lastLocation:{lat:Number,lng:Number,at:Date},isOnline:{type:Boolean,default:false},deliveryZones:[String],identityDocuments:[String],deletedAt:Date},{timestamps:true});
userSchema.index({email:1},{unique:true,sparse:true});
userSchema.index({phone:1},{unique:true,sparse:true});
const restaurantSchema=new Schema({owner:{type:Schema.Types.ObjectId,ref:'User',required:true},name:{type:String,required:true},description:String,phone:String,address:String,city:{type:String,default:'Cotonou'},deliveryZones:[{type:String,trim:true}],deliveryZoneFees:[{zone:{type:String,trim:true,required:true},fee:{type:Number,min:0,required:true},status:{type:String,enum:['pending','approved','rejected','superseded'],default:'pending'},requestedAt:{type:Date,default:Date.now},reviewedAt:Date,reviewedBy:{type:Schema.Types.ObjectId,ref:'User'},note:{type:String,default:''}}],deliveryZoneRequests:[{zones:[{type:String,trim:true}],status:{type:String,enum:['pending','approved','rejected'],default:'pending'},requestedAt:{type:Date,default:Date.now},reviewedAt:Date,reviewedBy:{type:Schema.Types.ObjectId,ref:'User'},note:{type:String,default:''}}],location:{lat:Number,lng:Number},categories:[String],openingHours:String,approved:{type:Boolean,default:false},active:{type:Boolean,default:true},walletBalance:{type:Number,default:0},walletReserved:{type:Number,default:0},billingMode:{type:String,enum:['commission_wallet','subscription'],default:'commission_wallet'},codEnabled:{type:Boolean,default:false},subscription:{plan:{type:String,default:'starter'},expiresAt:Date}},{timestamps:true});
const menuSchema=new Schema({restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true},name:{type:String,required:true},description:String,price:{type:Number,min:0,required:true},imageUrls:[String],videoUrls:[String],category:String,options:[{name:{type:String,trim:true},required:{type:Boolean,default:false},choices:[{name:{type:String,trim:true},price:{type:Number,min:0,default:0}}]}],customizationNotes:{type:Boolean,default:true},available:{type:Boolean,default:true},stock:Number},{timestamps:true});
const orderSchema=new Schema({code:{type:String,unique:true},customer:{type:Schema.Types.ObjectId,ref:'User',required:true},restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true},rider:{type:Schema.Types.ObjectId,ref:'User'},items:[{menuItem:{type:Schema.Types.ObjectId,ref:'MenuItem'},name:String,quantity:Number,unitPrice:Number,customizations:[{group:String,choice:String,extraPrice:{type:Number,default:0}}],customerNote:{type:String,default:'',maxlength:300}}],foodSubtotal:Number,deliveryFee:Number,paymentFeeRate:{type:Number,default:0},paymentFee:{type:Number,default:0},total:Number,commissionRate:Number,commissionAmount:Number,codCommissionReserved:{type:Boolean,default:false},billingMode:{type:String,enum:['commission_wallet','subscription'],default:'commission_wallet'},riderFee:Number,masterFee:Number,dunuDeliveryFee:Number,restaurantFoodAmount:Number,masterFoodAmount:Number,dunuFoodAmount:Number,revenueSplitVersion:{type:String,default:''},paymentMethod:{type:String,enum:['cash','mobile_money'],default:'cash'},paymentStatus:{type:String,enum:['pending','paid','failed','refunded'],default:'pending'},status:{type:String,enum:['placed','accepted','preparing','ready','picked_up','on_the_way','delivered','cancelled'],default:'placed'},deliveryAddress:String,deliveryCity:{type:String,trim:true},deliveryZone:{type:String,trim:true},recipientName:{type:String,trim:true},recipientPhone:{type:String,trim:true},isIntercity:{type:Boolean,default:false},customerLocation:{lat:Number,lng:Number},deliveryLocation:{lat:Number,lng:Number},deliveryOtpHash:String,deliveryOtpCode:{type:String,select:false},archivedAt:Date,archivedBy:{type:Schema.Types.ObjectId,ref:'User'},archiveReason:{type:String,default:''},deliveredAt:Date,notes:String,events:[{status:String,by:Schema.Types.ObjectId,at:Date,note:String}]},{timestamps:true});
const ledgerSchema=new Schema({accountType:{type:String,enum:['restaurant','restaurant_proceeds','restaurant_commission','platform','rider','customer','master','delivery_clearing'],required:true},accountId:{type:Schema.Types.ObjectId},order:{type:Schema.Types.ObjectId,ref:'Order'},kind:{type:String,enum:['cod_commission','topup','online_credit','commission_income','rider_earning','withdrawal','refund','adjustment','delivery_fee_collection','delivery_fee_distribution','food_sale_collection','food_sale_distribution','restaurant_sale_income'],required:true},direction:{type:String,enum:['credit','debit'],required:true},amount:{type:Number,min:1,required:true},currency:{type:String,default:'XOF'},status:{type:String,enum:['pending','available','blocked','reversed'],default:'available'},reference:{type:String,unique:true,sparse:true},beneficiaryCity:{type:String,trim:true,default:''},description:String},{timestamps:true});
const paymentSchema=new Schema({order:{type:Schema.Types.ObjectId,ref:'Order'},purpose:{type:String,enum:['order','subscription','restaurant_topup'],default:'order',index:true},restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant'},subscriptionRequest:{type:Schema.Types.ObjectId,ref:'SubscriptionRequest'},provider:{type:String,default:'feexpay'},providerReference:{type:String,unique:true,sparse:true},network:String,status:{type:String,default:'CREATED'},amount:Number,currency:{type:String,default:'XOF'},raw:Schema.Types.Mixed},{timestamps:true});
const webhookDeliverySchema=new Schema({deliveryId:{type:String,unique:true,required:true},event:String,reference:String,processedAt:{type:Date,default:Date.now}},{timestamps:true});
const messageSchema=new Schema({conversationId:{type:String,index:true},sender:{type:Schema.Types.ObjectId,ref:'User'},recipient:{type:Schema.Types.ObjectId,ref:'User'},body:String,kind:{type:String,default:'text'},readAt:Date},{timestamps:true});
const callSchema=new Schema({roomId:{type:String,unique:true},caller:{type:Schema.Types.ObjectId,ref:'User'},callee:{type:Schema.Types.ObjectId,ref:'User'},kind:{type:String,enum:['audio'],default:'audio'},status:{type:String,default:'ringing'},startedAt:Date,endedAt:Date},{timestamps:true});
const notificationSchema=new Schema({
  user:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  type:{type:String,default:'info',maxlength:50},
  title:{type:String,required:true,maxlength:160},
  body:{type:String,default:'',maxlength:1000},
  link:{type:String,default:''},
  readAt:Date,
  metadata:Schema.Types.Mixed
},{timestamps:true});
notificationSchema.index({user:1,createdAt:-1});
const commissionConfigSchema=new Schema({
  key:{type:String,default:'global',unique:true},
  commissionRate:{type:Number,min:0,max:50,default:Number(process.env.DEFAULT_COMMISSION_RATE || 10)},
  deliveryFee:{type:Number,min:0,max:100000,default:Number(process.env.DEFAULT_DELIVERY_FEE || 700)},
  codMinimumBalance:{type:Number,min:0,max:10000000,default:Number(process.env.COD_MINIMUM_BALANCE || 1000)},
  updatedBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
const subscriptionRequestSchema=new Schema({
  restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true,index:true},
  plan:{type:String,enum:['starter','business','premium'],required:true},
  amount:{type:Number,min:0,required:true},
  status:{type:String,enum:['pending','paid','approved','rejected'],default:'pending',index:true},
  paymentReference:{type:String,default:''},
  requestedBy:{type:Schema.Types.ObjectId,ref:'User',required:true},
  processedBy:{type:Schema.Types.ObjectId,ref:'User'},
  processedAt:Date,
  note:{type:String,maxlength:500}
},{timestamps:true});

const payoutRequestSchema = new Schema({
  beneficiary:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  accountType:{type:String,enum:['restaurant_proceeds','rider','master'],required:true},
  accountId:{type:Schema.Types.ObjectId,required:true,index:true},
  restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant'},
  amount:{type:Number,min:50,required:true},
  phoneNumber:{type:String,required:true},
  network:{type:String,enum:['MTN','MOOV','CELTIIS BJ'],required:true},
  status:{type:String,enum:['requested','approved','processing','SUCCESSFUL','FAILED','rejected','cancelled'],default:'requested',index:true},
  providerReference:{type:String,unique:true,sparse:true},
  callbackInfo:{type:String,unique:true,sparse:true},
  providerRaw:Schema.Types.Mixed,
  requestedAt:{type:Date,default:Date.now},
  reviewedBy:{type:Schema.Types.ObjectId,ref:'User'},
  reviewedAt:Date,
  completedAt:Date,
  failureReason:{type:String,default:''},
 cancelledAt:Date,
 cancelledBy:{type:Schema.Types.ObjectId,ref:'User'},
 cancellationReason:{type:String,default:''},
 retryOf:{type:Schema.Types.ObjectId,ref:'PayoutRequest'}
},{timestamps:true});
payoutRequestSchema.index({accountType:1,accountId:1,status:1});
payoutRequestSchema.index({retryOf:1},{unique:true,sparse:true});
const citySchema=new Schema({name:{type:String,required:true,unique:true,trim:true},department:{type:String,trim:true,default:''},active:{type:Boolean,default:true},neighborhoods:[{type:String,trim:true}],deliveryZones:[{name:String,fee:{type:Number,default:700},active:{type:Boolean,default:true}}]},{timestamps:true});
const auditLogSchema = new Schema({
 actor:{type:Schema.Types.ObjectId,ref:'User',required:true},
 actorRole:{type:String,required:true},
 action:{type:String,required:true,maxlength:80},
 targetType:{type:String,required:true,maxlength:50},
 targetId:{type:String,default:''},
 restaurant:{type:Schema.Types.ObjectId,ref:'Restaurant'},
 city:{type:String,default:''},
 details:{type:Schema.Types.Mixed,default:{}},
 ip:{type:String,default:''}
},{timestamps:true});
auditLogSchema.index({createdAt:-1});
auditLogSchema.index({restaurant:1,createdAt:-1});
export const AuditLog=model('AuditLog',auditLogSchema);
export const SubscriptionRequest=model('SubscriptionRequest',subscriptionRequestSchema);
export const Notification=model('Notification',notificationSchema);
export const CommissionConfig=model('CommissionConfig',commissionConfigSchema);
export const City=model('City',citySchema);
export const WebhookDelivery=model('WebhookDelivery',webhookDeliverySchema);
export const User=model('User',userSchema); export const Restaurant=model('Restaurant',restaurantSchema); export const MenuItem=model('MenuItem',menuSchema); export const Order=model('Order',orderSchema); export const Ledger=model('Ledger',ledgerSchema); export const Payment=model('Payment',paymentSchema); export const PayoutRequest=model('PayoutRequest',payoutRequestSchema); export const Message=model('Message',messageSchema); export const Call=model('Call',callSchema);


// Campagnes publicitaires DUNU : médias hébergés sur Cloudinary.
const adCampaignSchema = new Schema({
 title:{type:String,required:true,trim:true,maxlength:120}, description:{type:String,default:'',maxlength:500},
 mediaType:{type:String,enum:['image','video'],required:true}, mediaUrl:{type:String,required:true}, publicId:{type:String,default:''},
 buttonLabel:{type:String,default:'Découvrir',maxlength:40}, targetUrl:{type:String,default:'/plats',maxlength:300},
 placement:{type:String,enum:['home','all'],default:'home'}, startsAt:Date, endsAt:Date, active:{type:Boolean,default:true,index:true},
 createdBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
adCampaignSchema.index({active:1,startsAt:1,endsAt:1});
export const AdCampaign=model('AdCampaign',adCampaignSchema);
