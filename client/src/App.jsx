import React,{useEffect,useState,useRef}from'react';
import{Routes,Route,Link,useNavigate,useParams,useSearchParams,useLocation}from'react-router-dom';
import{Utensils,MapPin,ShoppingBag,LogIn,LogOut,Store,Bike,Shield,Wallet,Search,Phone,MessageCircle,RefreshCw,LocateFixed,Download, X, Menu, House, CircleUserRound, ChevronRight, Bell, ShieldCheck, UserRound, Activity}from'lucide-react';
import{io}from'socket.io-client';
import{api,token}from'./api';
import{uploadDunuMedia,uploadDunuAdMedia}from'./mediaUpload.js';

const roles={client:'Espace client',restaurant:'Espace restaurant',rider:'Espace livreur',master:'Master de ville',admin:'Administration nationale',finance:'Gestion financière'};

function InstallApp(){
 const[installPrompt,setInstallPrompt]=useState(null),[help,setHelp]=useState(false),[installed,setInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);
 const ua=navigator.userAgent||'';
 const isIOS=/iphone|ipad|ipod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const isAndroid=/android/i.test(ua);
 useEffect(()=>{
  const media=window.matchMedia('(display-mode: standalone)');
  const sync=()=>setInstalled(media.matches||navigator.standalone===true);
  const onPrompt=e=>{e.preventDefault();setInstallPrompt(e)};
  const onInstalled=()=>{setInstalled(true);setInstallPrompt(null);setHelp(false)};
  window.addEventListener('beforeinstallprompt',onPrompt);
  window.addEventListener('appinstalled',onInstalled);
  media.addEventListener?.('change',sync);
  sync();
  return()=>{window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled);media.removeEventListener?.('change',sync)};
 },[]);
 if(installed)return null;
 async function install(){
  if(installPrompt){
   installPrompt.prompt();
   const choice=await installPrompt.userChoice;
   if(choice?.outcome==='accepted'){setInstalled(true);setHelp(false)}
   setInstallPrompt(null);
   return;
  }
  setHelp(v=>!v);
 }
 return <aside className="install-banner home-install-cta" aria-label="Installer l'application DUNU">
  <div className="install-app-mark"><img src="/icons/dunu-192.png" alt=""/></div>
  <div className="install-copy"><b>Emportez DUNU partout avec vous</b><span>Installez l'application sur votre téléphone pour retrouver vos restaurants et commandes en un geste.</span></div>
  <div className="install-actions"><button type="button" className="install-button" onClick={install}><Download size={17}/>{installPrompt?'Installer DUNU':isIOS?'Ajouter DUNU': 'Installer DUNU'}</button></div>
  {help&&<div className="install-help"><button type="button" className="install-help-close" aria-label="Fermer" onClick={()=>setHelp(false)}><X size={17}/></button><b>{isIOS?'Ajouter DUNU sur iPhone':'Installer DUNU sur Android'}</b>{isIOS?<ol><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Appuyez sur le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>Sur l’écran d’accueil</b>.</li><li>Appuyez sur <b>Ajouter</b>. L’icône DUNU apparaîtra sur votre écran.</li></ol>:isAndroid?<ol><li>Dans Chrome, appuyez sur le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</li><li>Confirmez avec <b>Installer</b>.</li></ol>:<ol><li>Ouvrez le menu de votre navigateur.</li><li>Choisissez <b>Installer DUNU</b> ou <b>Installer cette application</b>.</li></ol>}<small>Après installation, ouvrez DUNU depuis son icône. Cette invitation ne s'affiche pas dans l'application installée.</small></div>}
 </aside>;
}
function Header({user,onLogout}){
 const [menuOpen,setMenuOpen]=useState(false);
 const location=useLocation();
 const close=()=>setMenuOpen(false);
 const active=(path)=>location.pathname===path?'active':'';
 const accountPath=user?'/dashboard':'/login';
 return <header className="home-premium-header">
  <div className="home-premium-header-inner">
   <button type="button" className="home-premium-menu" aria-label={menuOpen?'Fermer le menu':'Ouvrir le menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
   <Link to="/" className="home-premium-brand" onClick={close} aria-label="Accueil DUNU"><img src="/dunu-logo.webp" alt="DUNU"/></Link>
   <span className="home-premium-tagline">On commande, on savoure, on partage.</span>
   <div className="home-premium-actions">
    <Link to={accountPath} className="home-premium-icon" aria-label="Notifications"><Bell size={20}/></Link>
    <Link to={accountPath} className="home-premium-icon" aria-label="Mon profil"><UserRound size={20}/></Link>
   </div>
  </div>
  {menuOpen&&<>
   <button className="home-premium-backdrop" aria-label="Fermer le menu" onClick={close}/>
   <nav className="home-premium-drawer" aria-label="Menu principal">
    <Link className={active('/')} to="/" onClick={close}><House size={17}/> Accueil</Link>
    <Link className={active('/restaurants')} to="/restaurants" onClick={close}><Utensils size={17}/> Restaurants</Link>
    <Link className={active('/plats')} to="/plats" onClick={close}><ShoppingBag size={17}/> Plats</Link>
    <Link className={active('/track')} to="/track" onClick={close}><MapPin size={17}/> Suivre une commande</Link>
    <Link className={active('/contact')} to="/contact" onClick={close}><MessageCircle size={17}/> Contact</Link>
    <Link to={accountPath} onClick={close}><CircleUserRound size={17}/> {user?'Mon espace':'Connexion'}</Link>
    {user&&<button type="button" onClick={()=>{close();onLogout()}}><LogOut size={17}/> Déconnexion</button>}
   </nav>
  </>}
  <nav className="home-premium-bottom-nav" aria-label="Navigation DUNU">
   <Link className={active('/')} to="/"><House/><span>Accueil</span></Link>
   <Link className={active('/restaurants')} to="/restaurants"><Utensils/><span>Restaurants</span></Link>
   <Link className={active('/plats')} to="/plats"><ShoppingBag/><span>Plats</span></Link>
   <Link className={active('/track')} to="/track"><MapPin/><span>Suivi</span></Link>
   <Link className={location.pathname==='/dashboard'||location.pathname==='/login'? 'active':''} to={accountPath}><CircleUserRound/><span>Mon espace</span></Link>
  </nav>
 </header>
}

function App(){
 const[user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('dunu_user'))}catch{return null}});
 const[notice,setNotice]=useState('');
 const[events,setEvents]=useState([]);
 const navigate=useNavigate();
 useEffect(()=>{
  if(!token())return;
  const s=io(import.meta.env.VITE_API_URL||undefined,{auth:{token:token()}});
  s.on('order:new',o=>{setEvents(x=>[`${o.code||'Nouvelle commande'} reçue`,...x].slice(0,5));setNotice('Nouvelle commande reçue')});
  s.on('call:incoming',c=>setNotice(`Appel entrant (${c.kind}) de ${c.caller?.name||'un utilisateur'}`));
  s.on('notification:new',n=>{setNotice(n.title||'Nouvelle notification');if(n.type!=='call'&&'Notification' in window&&window.Notification.permission==='granted'){try{const notice=new window.Notification(n.title||'Notification DUNU',{body:n.body||'',icon:'/dunu-logo.webp',tag:`dunu-notice-${n._id||Date.now()}`});notice.onclick=()=>window.focus()}catch{}}});
  s.on('message:new',m=>setNotice('Nouveau message reçu'));
  return()=>s.disconnect();
 },[user]);
 function logout(){localStorage.removeItem('dunu_token');localStorage.removeItem('dunu_user');setUser(null);navigate('/')}
 return <><Header user={user} onLogout={logout}/>{notice&&<div className="toast" onClick={()=>setNotice('')}>{notice} ×</div>}<Routes><Route path="/" element={<Home/>}/><Route path="/restaurants" element={<Restaurants/>}/><Route path="/plats" element={<Dishes/>}/><Route path="/restaurants/:id" element={<RestaurantDetail/>}/><Route path="/contact" element={<Contact/>}/><Route path="/login" element={<Login onLogin={u=>{setUser(u);navigate('/dashboard')}}/>}/><Route path="/register" element={<Register/>}/><Route path="/forgot-password" element={<ForgotPassword/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/dashboard" element={<Dashboard user={user} events={events}/>}/><Route path="/track" element={<Track/>}/><Route path="*" element={<Home/>}/></Routes>{user&&<CallPanel user={user} globalListener/>}<footer className="site-footer">
  <div className="site-footer-inner">
   <div className="footer-brand-block"><strong>DUNU BENIN</strong><p>On commande, on savoure, on partage.</p></div>
   <div className="footer-links-block"><b>Navigation</b><Link to="/restaurants">Restaurants</Link><Link to="/plats">Plats</Link><Link to="/track">Suivre une commande</Link><Link to="/contact">Contact</Link></div>
   <div className="footer-contact-block"><b>Besoin d'aide ?</b><a href="mailto:contact@dunubenin.com">contact@dunubenin.com</a><a href="mailto:reclamation@dunubenin.com">Réclamations</a><a href="tel:+2290142222197">+229 01 42 22 21 97</a><a href="https://wa.me/2290142222197" target="_blank" rel="noreferrer">WhatsApp</a></div>
   <div className="footer-bottom"><small>© {new Date().getFullYear()} DUNU BENIN · Tous droits réservés</small><small>Restaurant · Commande · Livraison</small></div>
  </div>
</footer></>
}

function Contact(){return <main className="page"><span className="eyebrow">NOUS JOINDRE</span><h1>Contact DUNU BENIN</h1><p>Notre équipe est disponible pour vous accompagner.</p><section className="panel contact-panel">
  <p><b>Service général</b><br/><a href="mailto:contact@dunubenin.com">contact@dunubenin.com</a></p>
  <p><b>Réclamations</b><br/><a href="mailto:reclamation@dunubenin.com">reclamation@dunubenin.com</a></p>
  <p><b>Téléphone</b><br/><a href="tel:+2290142222197">+229 01 42 22 21 97</a></p>
  <p><b>WhatsApp</b><br/><a className="primary" href="https://wa.me/2290142222197" target="_blank" rel="noreferrer"><MessageCircle size={16}/> Écrire à DUNU BENIN</a></p>
</section></main>}

function HomeHowItWorks(){
 const slides=[
  {number:'01',icon:Search,title:'Trouvez près de chez vous',body:'Choisissez votre ville et votre quartier pour découvrir les restaurants qui livrent dans votre zone.'},
  {number:'02',icon:ShoppingBag,title:'Choisissez vos envies',body:'Comparez les plats, consultez les menus et ajoutez vos favoris au panier en quelques gestes.'},
  {number:'03',icon:Bike,title:'Recevez et suivez',body:'Confirmez votre commande puis suivez sa préparation et sa livraison depuis votre espace.'}
 ];
 const [active,setActive]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>setActive(v=>(v+1)%slides.length),5200);return()=>clearInterval(timer)},[]);
 const current=slides[active],SlideIcon=current.icon;
 return <section className="home-how" aria-label="Comment utiliser DUNU">
  <div className="home-how-copy"><span className="eyebrow">SIMPLE ET RAPIDE</span><h2>Commander sur DUNU, c'est facile</h2><p>Trois gestes pour profiter de vos plats préférés.</p></div>
  <div className="how-slide" key={active}><div className="how-slide-icon"><SlideIcon size={25}/></div><div className="how-slide-text"><span className="how-slide-count">{current.number} / 03</span><h3>{current.title}</h3><p>{current.body}</p></div><div className="how-slide-controls"><button type="button" className="how-arrow" aria-label="Étape précédente" onClick={()=>setActive(v=>(v+slides.length-1)%slides.length)}>‹</button><div className="how-dots">{slides.map((item,i)=><button key={item.number} type="button" aria-label={`Afficher l'étape ${item.number}`} aria-current={i===active?'step':undefined} className={i===active?'how-dot active':'how-dot'} onClick={()=>setActive(i)}/>)}</div><button type="button" className="how-arrow" aria-label="Étape suivante" onClick={()=>setActive(v=>(v+1)%slides.length)}>›</button></div></div>
 </section>
}

function PublicAds(){const[ads,setAds]=useState([]);const[index,setIndex]=useState(0);useEffect(()=>{api('/ads/public').then(setAds).catch(()=>{})},[]);useEffect(()=>{if(ads.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%ads.length),6000);return()=>clearInterval(timer)},[ads]);if(!ads.length)return null;const ad=ads[index%ads.length];return <section className="public-ad-banner" aria-label="Offres et publicités"><div className="public-ad-media">{ad.mediaType==='video'?<video src={ad.mediaUrl} autoPlay muted loop playsInline controls={false}/>:<img src={ad.mediaUrl} alt={ad.title}/>}</div><div className="public-ad-copy"><span className="eyebrow">À LA UNE SUR DUNU</span><h2>{ad.title}</h2>{ad.description&&<p>{ad.description}</p>}<Link className="primary" to={ad.targetUrl||'/plats'}>{ad.buttonLabel||'Découvrir'} <ChevronRight size={16}/></Link><div className="public-ad-dots">{ads.map((x,i)=><button key={x._id} type="button" aria-label={`Publicité ${i+1}`} className={i===index?'active':''} onClick={()=>setIndex(i)}/>)}</div></div></section>}

function Home(){
 const [dishes,setDishes]=useState([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;api('/catalog/dishes').then(rows=>{if(alive)setDishes((Array.isArray(rows)?rows:[]).slice(0,4))}).catch(()=>{}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
 const money=value=>`${Number(value||0).toLocaleString('fr-FR')} FCFA`;
 return <main className="home-page home-v18">
  <PublicAds/>
  <section className="home-v18-intro">
   <div><span className="eyebrow">LES SAVEURS DU BÉNIN, CHEZ VOUS</span><h1>Une envie de bien manger ? <em>DUNU s'en occupe.</em></h1><p>Découvrez les restaurants près de vous et faites-vous livrer vos plats préférés.</p></div>
   <div className="home-v18-actions"><Link className="primary" to="/plats">Commander <ChevronRight size={17}/></Link><Link className="home-v18-secondary" to="/restaurants">Voir les restaurants</Link></div>
  </section>
  <section className="home-v18-shortcuts" aria-label="Accès rapides">
   <Link to="/restaurants"><Utensils size={21}/><span>Restaurants</span></Link>
   <Link to="/plats"><ShoppingBag size={21}/><span>Plats</span></Link>
   <Link to="/track"><MapPin size={21}/><span>Suivre ma commande</span></Link>
   <Link to="/contact"><MessageCircle size={21}/><span>Aide & messages</span></Link>
  </section>
  <InstallApp/>
  <section className="home-v16-dishes home-v18-dishes"><div className="home-v16-sectionhead"><div><span className="eyebrow">À TABLE !</span><h2>Les plats qui donnent envie</h2><p>Une sélection de plats disponibles chez nos restaurants partenaires.</p></div><Link to="/plats" className="home-v16-all">Tout le catalogue <ChevronRight size={16}/></Link></div>
   {loading?<div className="home-v16-loading">Chargement des plats…</div>:dishes.length?<div className="home-v16-grid">{dishes.map((dish,i)=><Link to="/plats" className="home-v16-dish" key={dish._id||i}><div className="home-v16-dish-image"><img src={dish.imageUrls?.[0]||'/dunu-plats-inspiration.webp'} alt={dish.name} loading="lazy"/><span>{dish.category||'À découvrir'}</span></div><div className="home-v16-dish-info"><h3>{dish.name}</h3><p>{dish.restaurant?.name||'Restaurant partenaire'}{dish.restaurant?.city?` · ${dish.restaurant.city}`:''}</p><b>{money(dish.price)}</b></div></Link>)}</div>:<div className="home-v16-empty"><img src="/dunu-plats-inspiration.webp" alt="Cuisine généreuse et spécialités locales"/><div><h3>Vos prochaines découvertes commencent ici.</h3><p>Les plats de nos restaurants partenaires apparaîtront ici dès leur publication.</p><Link className="primary" to="/restaurants">Découvrir les restaurants <ChevronRight size={16}/></Link></div></div>}
  </section>
  <section className="home-v18-footer-cta"><div><span className="eyebrow">VOTRE PROCHAIN REPAS EST TOUT PRÈS</span><h2>On commande, on savoure, on partage.</h2></div><Link className="primary" to="/plats">Explorer les plats <ChevronRight size={17}/></Link></section>
 </main>
}

function DiscoveryChrome({active}){
 const[menuOpen,setMenuOpen]=useState(false);
 const[user]=useState(()=>{try{return JSON.parse(localStorage.getItem('dunu_user'))}catch{return null}});
 return <div className="discovery-chrome">
  <header className="discovery-topbar">
   <button type="button" className="discovery-menu-button" aria-label={menuOpen?'Fermer le menu':'Ouvrir le menu'} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={21}/>:<Menu size={21}/>}</button>
   <Link to="/" className="discovery-brand" aria-label="Accueil DUNU"><img src="/dunu-logo.webp" alt="DUNU"/></Link>
   <span className="discovery-tagline">On commande, on savoure, on partage.</span>
   <div className="discovery-top-actions">
    <Link to={user?"/dashboard":"/login"} aria-label="Notifications" className="discovery-icon-button"><Bell size={19}/></Link>
    <Link to={user?"/dashboard":"/login"} aria-label="Mon profil" className="discovery-icon-button"><UserRound size={19}/></Link>
   </div>
  </header>
  {menuOpen&&<nav className="discovery-drawer" aria-label="Menu principal"><Link to="/" onClick={()=>setMenuOpen(false)}>Accueil</Link><Link to="/restaurants" onClick={()=>setMenuOpen(false)}>Restaurants</Link><Link to="/plats" onClick={()=>setMenuOpen(false)}>Plats</Link><Link to="/track" onClick={()=>setMenuOpen(false)}>Suivre une commande</Link><Link to="/contact" onClick={()=>setMenuOpen(false)}>Contact</Link><Link to={user?"/dashboard":"/login"} onClick={()=>setMenuOpen(false)}>Mon espace</Link></nav>}
  <nav className="discovery-bottom-nav" aria-label="Navigation DUNU">
   <Link className={active==='home'?'active':''} to="/"><House/><span>Accueil</span></Link>
   <Link className={active==='restaurants'?'active':''} to="/restaurants"><Utensils/><span>Restaurants</span></Link>
   <Link className={active==='plats'?'active':''} to="/plats"><ShoppingBag/><span>Plats</span></Link>
   <Link to="/track"><MapPin/><span>Suivi</span></Link>
   <Link to={user?"/dashboard":"/login"}><CircleUserRound/><span>Mon espace</span></Link>
  </nav>
 </div>
}

const discoveryCategories=[
 {label:'Tous',emoji:'▦',keys:[]},
 {label:'Béninois',emoji:'🍲',keys:['bénin','benin','local','afric']},
 {label:'Grillades',emoji:'🍢',keys:['grill','brais','brochette']},
 {label:'Fast-food',emoji:'🍔',keys:['burger','pizza','fast','sandwich']},
 {label:'Boissons',emoji:'🥤',keys:['boisson','jus','eau','drink']}
];
function Restaurants(){
 const[rows,setRows]=useState([]),[q,setQ]=useState(''),[err,setErr]=useState(''),[cities,setCities]=useState([]),[city,setCity]=useState(()=>localStorage.getItem('dunu_city')||''),[zone,setZone]=useState(()=>localStorage.getItem('dunu_zone')||''),[coords,setCoords]=useState(null),[geoMessage,setGeoMessage]=useState('Choisissez votre ville ou utilisez votre position.'),[locating,setLocating]=useState(false),[filtersOpen,setFiltersOpen]=useState(false),[category,setCategory]=useState('Tous');
 useEffect(()=>{api('/catalog/cities').then(setCities).catch(()=>{});if(navigator.geolocation){setLocating(true);navigator.geolocation.getCurrentPosition(pos=>{setCoords({lat:pos.coords.latitude,lng:pos.coords.longitude});setGeoMessage('Restaurants classés selon votre proximité.');setLocating(false)},()=>{setGeoMessage('Localisation non disponible : choisissez votre ville.');setLocating(false)},{enableHighAccuracy:false,timeout:7000,maximumAge:300000})}},[]);
 useEffect(()=>{const params=new URLSearchParams();if(city)params.set('city',city);if(zone)params.set('zone',zone);if(coords){params.set('lat',coords.lat);params.set('lng',coords.lng)}api(`/catalog/restaurants${params.toString()?`?${params}`:''}`).then(setRows).catch(e=>setErr(e.message));},[city,zone,coords]);
 const selectedCity=cities.find(c=>c.name===city);const zones=[...(selectedCity?.deliveryZones||[]).filter(z=>z.active!==false).map(z=>typeof z==='string'?z:z.name),...(selectedCity?.neighborhoods||[])].filter(Boolean);
 function chooseCity(value){setCity(value);setZone('');localStorage.setItem('dunu_city',value);localStorage.removeItem('dunu_zone')}
 function chooseZone(value){setZone(value);localStorage.setItem('dunu_zone',value)}
 function locate(){if(!navigator.geolocation){setGeoMessage('Votre navigateur ne prend pas en charge la géolocalisation.');return}setLocating(true);navigator.geolocation.getCurrentPosition(pos=>{setCoords({lat:pos.coords.latitude,lng:pos.coords.longitude});setGeoMessage('Restaurants classés selon votre proximité.');setLocating(false)},e=>{setGeoMessage(e.code===1?'Localisation refusée. Vous pouvez choisir votre ville manuellement.':e.code===2?'Position introuvable. Activez le GPS ou choisissez votre ville.':'Le GPS met trop de temps à répondre. Réessayez ou choisissez votre ville.');setLocating(false)},{enableHighAccuracy:true,timeout:12000,maximumAge:60000})}
 const filtered=rows.filter(x=>{
  const text=[x.name,x.description,x.city,x.category,x.address].filter(Boolean).join(' ').toLowerCase();
  const matchQuery=text.includes(q.toLowerCase());
  const cat=discoveryCategories.find(c=>c.label===category);
  const matchCategory=!cat||!cat.keys.length||cat.keys.some(k=>text.includes(k));
  return matchQuery&&matchCategory;
 });
 return <main className="discovery-page discovery-restaurants">
  <section className="discovery-hero discovery-hero-restaurants">
   <div><span className="discovery-kicker">LES BONNES ADRESSES DU BÉNIN</span><h1>Trouvez votre restaurant <em>préféré.</em></h1><p>Découvrez les meilleures tables près de vous et choisissez votre prochaine envie.</p></div>
  </section>
  <div className="discovery-search-row"><label className="discovery-search"><Search/><input placeholder="Rechercher un restaurant…" value={q} onChange={e=>setQ(e.target.value)}/></label><button className={`discovery-filter-toggle ${filtersOpen?'selected':''}`} onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen}><Activity size={19}/><span>Filtres</span></button></div>
  <section className={`discovery-location ${filtersOpen?'expanded':''}`}>
   <button type="button" className="discovery-location-summary" onClick={()=>setFiltersOpen(v=>!v)}><MapPin/><span><b>Livraison dans ma zone</b><small>{city?`${city}${zone?` · ${zone}`:''}`:'Choisissez votre ville et votre quartier'}</small></span><ChevronRight className="discovery-location-chevron"/></button>
   <div className="discovery-location-controls">
    <label>Ville<select value={city} onChange={e=>chooseCity(e.target.value)}><option value="">Toutes les villes</option>{cities.map(c=><option key={c._id||c.name} value={c.name}>{c.name}</option>)}</select></label>
    <label>Quartier / zone<select value={zone} onChange={e=>chooseZone(e.target.value)} disabled={!city||!zones.length}><option value="">Toutes les zones</option>{[...new Set(zones)].map(z=><option key={z} value={z}>{z}</option>)}</select></label>
    <button type="button" className="discovery-locate" onClick={locate} disabled={locating}><LocateFixed size={16}/>{locating?'Localisation…':'Me localiser'}</button>
    <small>{geoMessage}</small>
   </div>
  </section>
  <section className="discovery-category-section"><div className="discovery-section-heading"><h2>Explorez par envie</h2><span>{filtered.length} restaurants</span></div><div className="discovery-category-list">{discoveryCategories.map(c=><button key={c.label} className={category===c.label?'active':''} onClick={()=>setCategory(c.label)}><span>{c.emoji}</span>{c.label}</button>)}</div></section>
  <section className="discovery-results"><div className="discovery-section-heading"><div><span className="discovery-kicker">À DÉCOUVRIR</span><h2>Restaurants partenaires</h2></div><span className="discovery-results-count">{filtered.length} résultat{filtered.length>1?'s':''}</span></div>
   {err&&<p className="error">{err}</p>}
   <div className="discovery-restaurant-grid">{filtered.map(x=><Link className="discovery-restaurant-card" key={x._id} to={`/restaurants/${x._id}`}><div className="discovery-restaurant-photo">{x.imageUrls?.[0]?<img src={x.imageUrls[0]} alt={x.name} loading="lazy"/>:<span>🍽️</span>}<span className="discovery-photo-label">{x.category||'Restaurant partenaire'}</span></div><div className="discovery-restaurant-info"><div className="discovery-card-title"><h3>{x.name}</h3><span className="discovery-card-arrow"><ChevronRight size={17}/></span></div><p>{x.description||'Découvrez ses spécialités et son menu.'}</p><div className="discovery-card-meta"><span><MapPin size={14}/>{x.city||'Bénin'}</span>{Number.isFinite(x.distanceKm)&&<span>{x.distanceKm.toFixed(1)} km</span>}</div><div className="discovery-card-footer">{x.rating&&<span className="discovery-rating">★ {x.rating}</span>}{x.isOpen===true&&<span className="discovery-open">● Ouvert</span>}<b>Voir le menu <ChevronRight size={14}/></b></div></div></Link>)}</div>
   {!filtered.length&&!err&&<div className="discovery-empty"><span>🍽️</span><b>Aucun restaurant pour cette sélection</b><p>Essayez une autre recherche ou élargissez votre zone.</p></div>}
  </section>
 </main>
}
function Dishes(){
 const[rows,setRows]=useState([]),[cities,setCities]=useState([]),[city,setCity]=useState(()=>localStorage.getItem('dunu_city')||''),[zone,setZone]=useState(()=>localStorage.getItem('dunu_zone')||''),[q,setQ]=useState(''),[query,setQuery]=useState(''),[coords,setCoords]=useState(null),[err,setErr]=useState(''),[loading,setLoading]=useState(true),[geoMessage,setGeoMessage]=useState('Choisissez une ville ou activez la localisation.'),[filtersOpen,setFiltersOpen]=useState(false),[category,setCategory]=useState('Tous');
 useEffect(()=>{api('/catalog/cities').then(setCities).catch(()=>{});if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{setCoords({lat:p.coords.latitude,lng:p.coords.longitude});setGeoMessage('Les plats des restaurants proches sont affichés en premier.')},()=>setGeoMessage('Choisissez une ville ou activez la localisation pour trier par proximité.'),{timeout:7000,maximumAge:300000})},[]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(q.trim()),250);return()=>clearTimeout(timer)},[q]);
 useEffect(()=>{let cancelled=false;setLoading(true);setErr('');const params=new URLSearchParams();if(city)params.set('city',city);if(zone)params.set('zone',zone);if(query)params.set('q',query);if(coords){params.set('lat',coords.lat);params.set('lng',coords.lng)}api(`/catalog/dishes${params.toString()?`?${params}`:''}`).then(data=>{if(!cancelled)setRows(data)}).catch(e=>{if(!cancelled)setErr(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[city,zone,query,coords]);
 const selected=cities.find(c=>c.name===city);const zones=[...(selected?.neighborhoods||[]),...(selected?.deliveryZones||[]).map(z=>typeof z==='string'?z:z.name)].filter(Boolean);
 const categories=[{label:'Tous',emoji:'▦',keys:[]},{label:'Plats béninois',emoji:'🍲',keys:['bénin','benin','local','afric']},{label:'Grillades',emoji:'🍢',keys:['grill','brais','brochette']},{label:'Spécialités',emoji:'🥘',keys:['spécial','special','sauce']},{label:'Fast-food',emoji:'🍔',keys:['burger','pizza','sandwich','fast']}];
 const visibleRows=rows.filter(item=>{const text=[item.name,item.description,item.category,item.restaurant?.name,item.restaurant?.city].filter(Boolean).join(' ').toLowerCase();const c=categories.find(x=>x.label===category);return !c||!c.keys.length||c.keys.some(k=>text.includes(k))});
 return <main className="discovery-page discovery-dishes">
  <section className="discovery-hero discovery-hero-dishes"><div><span className="discovery-kicker">LE GOÛT DU BÉNIN À PORTÉE DE CLIC</span><h1>Nos plats <em>vous attendent.</em></h1><p>Des recettes généreuses, des spécialités locales et de belles découvertes à savourer.</p></div></section>
  <div className="discovery-search-row"><label className="discovery-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un plat, une spécialité…"/></label><button className={`discovery-filter-toggle ${filtersOpen?'selected':''}`} onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen}><Activity size={19}/><span>Filtres</span></button></div>
  <section className={`discovery-location ${filtersOpen?'expanded':''}`}>
   <button type="button" className="discovery-location-summary" onClick={()=>setFiltersOpen(v=>!v)}><MapPin/><span><b>Livraison dans ma zone</b><small>{city?`${city}${zone?` · ${zone}`:''}`:'Choisissez votre ville et votre quartier'}</small></span><ChevronRight className="discovery-location-chevron"/></button>
   <div className="discovery-location-controls">
    <label>Ville<select value={city} onChange={e=>{setCity(e.target.value);setZone('');localStorage.setItem('dunu_city',e.target.value);localStorage.removeItem('dunu_zone')}}><option value="">Toutes les villes</option>{cities.map(c=><option key={c._id||c.name} value={c.name}>{c.name}</option>)}</select></label>
    <label>Quartier / zone<select value={zone} onChange={e=>{setZone(e.target.value);localStorage.setItem('dunu_zone',e.target.value)}} disabled={!city}><option value="">Toutes les zones</option>{[...new Set(zones)].map(z=><option key={z} value={z}>{z}</option>)}</select></label>
    <small>{geoMessage}</small>
   </div>
  </section>
  <section className="discovery-category-section"><div className="discovery-section-heading"><h2>Choisissez votre envie</h2><span>{visibleRows.length} plats</span></div><div className="discovery-category-list">{categories.map(c=><button key={c.label} className={category===c.label?'active':''} onClick={()=>setCategory(c.label)}><span>{c.emoji}</span>{c.label}</button>)}</div></section>
  <section className="discovery-results"><div className="discovery-section-heading"><div><span className="discovery-kicker">À SAVOURER</span><h2>Plats populaires</h2></div><span className="discovery-results-count">{visibleRows.length} résultat{visibleRows.length>1?'s':''}</span></div>
   {err&&<p className="error">{err}</p>}
   {loading?<div className="discovery-loading">Préparation de votre sélection…</div>:<div className="discovery-dish-grid">{visibleRows.map(item=><article className="discovery-dish-card" key={item._id}><Link to={`/restaurants/${item.restaurant._id}`} className="discovery-dish-photo">{item.imageUrls?.[0]?<img src={item.imageUrls[0]} alt={item.name} loading="lazy"/>:<span>🍲</span>}</Link><div className="discovery-dish-info"><small>{item.restaurant?.name||'Restaurant partenaire'}{item.restaurant?.city?` · ${item.restaurant.city}`:''}</small><h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}<div className="discovery-dish-bottom"><b>{Number(item.price).toLocaleString('fr-FR')} FCFA</b><Link to={`/restaurants/${item.restaurant._id}`} className="discovery-order-button">Commander <ChevronRight size={14}/></Link></div></div>{item.videoUrls?.[0]&&<video className="discovery-dish-video" src={item.videoUrls[0]} controls preload="none"/>}</article>)}</div>}
   {!loading&&!visibleRows.length&&!err&&<div className="discovery-empty"><span>🍲</span><b>Aucun plat pour cette sélection</b><p>Essayez une autre recherche ou une autre catégorie.</p></div>}
  </section>
 </main>
}

function Login({onLogin}){
 const location=useLocation();
 const[identifier,setI]=useState(''),[password,setP]=useState(''),[err,setE]=useState(''),[busy,setB]=useState(false);
 const registrationNotice=location.state?.registrationNotice||'';
 async function submit(e){e.preventDefault();setB(true);setE('');try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({identifier,password})});localStorage.setItem('dunu_token',d.token);localStorage.setItem('dunu_user',JSON.stringify(d.user));onLogin(d.user)}catch(e){setE(e.message)}finally{setB(false)}}
 return <main className="auth"><form className="panel" onSubmit={submit}><span className="eyebrow">BON RETOUR</span><h1>Connexion</h1>{registrationNotice&&<p className="success" role="status">{registrationNotice}</p>}<label>Identifiant / e-mail / téléphone<input required autoComplete="username" value={identifier} onChange={e=>setI(e.target.value)} placeholder="ADMIN ou nom@exemple.com ou +229…"/></label><label>Mot de passe<input type="password" required autoComplete="current-password" value={password} onChange={e=>setP(e.target.value)}/></label>{err&&<p className="error">{err}</p>}<button className="primary full" disabled={busy}>{busy?'Connexion…':'Se connecter'}</button><p><Link to="/forgot-password">Mot de passe oublié ?</Link></p><p>Pas encore de compte ? <Link to="/register">Créer un compte</Link></p></form></main>
}

function ForgotPassword(){
 const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});setMessage(d.message)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <main className="auth"><form className="panel" onSubmit={submit}><span className="eyebrow">RÉCUPÉRATION DU COMPTE</span><h1>Mot de passe oublié</h1><p>Indiquez l’adresse e-mail associée à votre compte. Si elle correspond à un compte DUNU, vous recevrez un lien valable 30 minutes.</p><label>Adresse e-mail<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com"/></label>{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Envoi…':'Recevoir le lien'}</button><p><Link to="/login">Retour à la connexion</Link></p></form></main>
}
function ResetPassword(){
 const params=new URLSearchParams(window.location.search),tokenValue=params.get('token')||'';
 const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setError('');setMessage('');if(password!==confirm){setError('Les deux mots de passe ne correspondent pas.');return}setBusy(true);try{const d=await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token:tokenValue,password})});setMessage(d.message)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <main className="auth"><form className="panel" onSubmit={submit}><span className="eyebrow">SÉCURITÉ DU COMPTE</span><h1>Nouveau mot de passe</h1>{!tokenValue?<p className="error">Lien manquant. Demandez une nouvelle réinitialisation.</p>:<><label>Nouveau mot de passe<input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmer le mot de passe<input type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></>}{message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}{tokenValue&&<button className="primary full" disabled={busy||!!message}>{busy?'Enregistrement…':'Modifier le mot de passe'}</button>}<p><Link to="/login">Retour à la connexion</Link></p></form></main>
}

function Register(){
 const navigate=useNavigate();
 const initialForm={name:'',email:'',phone:'+229',password:'',role:'client',city:'Cotonou',deliveryZone:''};
 const[form,setF]=useState(initialForm),[err,setE]=useState(''),[cities,setCities]=useState([]),[busy,setBusy]=useState(false);
 useEffect(()=>{api('/catalog/registration-cities').then(rows=>{setCities(rows);if(rows.length&&!rows.some(x=>x.name===form.city))setF(v=>({...v,city:'Cotonou'}))}).catch(e=>setE('Impossible de charger les 77 communes. '+e.message));},[]);
 const selected=cities.find(c=>c.name===form.city);const zones=[...(selected?.neighborhoods||[]),...(selected?.deliveryZones||[]).map(x=>typeof x==='string'?x:x.name)].filter(Boolean);const uniqueZones=[...new Set(zones)];
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);setE('');
  try{
   const d=await api('/auth/register',{method:'POST',body:JSON.stringify(form)});
   setF({...initialForm});
   navigate('/login',{replace:true,state:{registrationNotice:(d.message||'Votre compte a bien été créé.')+' Vous pouvez maintenant vous connecter avec vos identifiants.'}});
  }catch(e){setE(e.message)}finally{setBusy(false)}
 }
 return <main className="auth"><form className="panel" onSubmit={submit}><span className="eyebrow">REJOINDRE DUNU</span><h1>Créer un compte</h1>{[['name','Nom complet'],['email','E-mail (facultatif)'],['phone','Téléphone'],['password','Mot de passe']].map(([k,l])=><label key={k}>{l}<input required={k!=='email'} autoComplete={k==='password'?'new-password':k==='email'?'email':k==='phone'?'tel':'name'} type={k==='password'?'password':'text'} value={form[k]} onChange={e=>setF({...form,[k]:e.target.value})}/></label>)}<label>Ville principale<select required value={form.city} onChange={e=>setF({...form,city:e.target.value,deliveryZone:''})}>{cities.map(c=><option key={c.name} value={c.name}>{c.name} — {c.department}</option>)}</select></label><label>Quartier / zone habituelle<select value={form.deliveryZone} onChange={e=>setF({...form,deliveryZone:e.target.value})}><option value="">Sélectionner plus tard</option>{uniqueZones.map(z=><option key={z} value={z}>{z}</option>)}</select></label><label>Type de compte<select value={form.role} onChange={e=>setF({...form,role:e.target.value})}><option value="client">Client</option><option value="restaurant">Restaurant</option><option value="rider">Livreur</option></select></label>{err&&<p className="error">{err}</p>}<button className="primary full" disabled={busy}>{busy?'Création du compte…':'Créer mon compte'}</button><small>Les restaurants et livreurs doivent être validés par DUNU avant activation. Vous pourrez modifier votre zone de livraison ultérieurement. Pour récupérer votre mot de passe par e-mail, renseignez une adresse valide.</small><p>Vous avez déjà un compte ? <Link to="/login">Se connecter</Link></p></form></main>
}

function Dashboard({user,events}){
 const navigate=useNavigate();
 const [adminTab,setAdminTab]=useState('overview');
 const [adminSidebarOpen,setAdminSidebarOpen]=useState(false);
 const [dashboardMenuSearch,setDashboardMenuSearch]=useState('');
 const [clientTab,setClientTab]=useState('overview');
 const [showAllClientNotifications,setShowAllClientNotifications]=useState(false);
 const [showAllNotifications,setShowAllNotifications]=useState(false);
 const [showAllFinanceJournal,setShowAllFinanceJournal]=useState(false);
 const [profileImage,setProfileImage]=useState(user?.profileImage||''),[profileBusy,setProfileBusy]=useState(false),[profileMessage,setProfileMessage]=useState('');
 const adminTabs=[['overview','Vue générale'],['orders','Commandes'],['approvals','Validations'],['restaurants','Restaurants partenaires'],['users','Utilisateurs'],['staff','Équipe et accès'],['cities','Villes et zones'],['riders','Livreurs et GPS'],['finance','Finances'],['settings','Répartition 90/3/7'],['messages','Messages et appels audio'],['notifications','Notifications'],['audit','Journal des actions'],['ads','Publicité']];
 const restaurantTabs=[['overview','Vue générale'],['orders','Commandes'],['shop','Menu et boutique'],['riders','Livreurs'],['finance','Finances et reversements'],['messages','Messages et appels audio'],['notifications','Notifications']];
 const masterTabs=[['overview','Vue générale'],['orders','Commandes'],['riders','Livreurs et suivi'],['finance','Finances et commissions'],['messages','Messages et appels audio'],['notifications','Notifications'],['audit','Journal des actions']];
 const riderTabs=[['overview','Vue générale'],['missions','Missions disponibles'],['orders','Mes livraisons'],['finance','Mes gains et reversements'],['messages','Messages et appels audio'],['notifications','Notifications']];
 const financeTabs=[['overview','Vue générale'],['finance','Comptabilité'],['orders','Commandes'],['restaurants','Restaurants partenaires'],['notifications','Notifications']];
 const roleTabs={admin:adminTabs,restaurant:restaurantTabs,master:masterTabs,rider:riderTabs,finance:financeTabs};
 const dashboardTabs=roleTabs[user?.role]||[];
 // Regroupement purement visuel : toutes les rubriques et leurs clés existantes sont conservées.
 const dashboardNavGroups={
  admin:[['Pilotage',['overview','orders','approvals']],['Réseau',['restaurants','users','staff','cities','riders']],['Finances',['finance','settings']],['Communication',['messages','notifications']],['Contrôle',['audit','ads']]],
  master:[['Pilotage',['overview','orders']],['Équipe et territoire',['riders']],['Finances',['finance']],['Communication',['messages','notifications']],['Contrôle',['audit']]],
  restaurant:[['Activité',['overview','orders','shop']],['Équipe et finances',['riders','finance']],['Communication',['messages','notifications']]],
  rider:[['Activité',['overview','missions','orders']],['Revenus',['finance']],['Communication',['messages','notifications']]],
  finance:[['Pilotage',['overview','orders','restaurants']],['Comptabilité',['finance']],['Communication',['notifications']]]
 };
 const navGroups=(dashboardNavGroups[user?.role]||[['Navigation',dashboardTabs.map(([key])=>key)]]).map(([title,keys])=>({title,items:dashboardTabs.filter(([key])=>keys.includes(key))})).map(group=>({...group,items:group.items.filter(([,label])=>label.toLocaleLowerCase('fr').includes(dashboardMenuSearch.trim().toLocaleLowerCase('fr')))})).filter(group=>group.items.length);
 const tabVisible=(key)=>user?.role==='client'?clientTab===key:adminTab===key;

 const [adCampaigns,setAdCampaigns]=useState([]),[adForm,setAdForm]=useState({title:'',description:'',mediaType:'image',mediaUrl:'',publicId:'',buttonLabel:'Découvrir',targetUrl:'/plats',placement:'home'}),[adBusy,setAdBusy]=useState(false),[adProgress,setAdProgress]=useState(''),[adLocalPreview,setAdLocalPreview]=useState('');
 const [data,setData]=useState(null),[orders,setOrders]=useState([]),[analytics,setAnalytics]=useState(null),[riderEarnings,setRiderEarnings]=useState(null),[riderMissions,setRiderMissions]=useState([]),[financeSummary,setFinanceSummary]=useState(null),[pending,setPending]=useState({users:[],restaurants:[]}),[pendingAssignments,setPendingAssignments]=useState({}),[deliveryFeeRequests,setDeliveryFeeRequests]=useState([]),[deliveryZoneRequests,setDeliveryZoneRequests]=useState([]),[masterEditSelections,setMasterEditSelections]=useState({}),[shopZoneProposal,setShopZoneProposal]=useState(''),[staff,setStaff]=useState([]),[accounts,setAccounts]=useState([]),[riderPositions,setRiderPositions]=useState([]),[staffSuccess,setStaffSuccess]=useState(''),[staffForm,setStaffForm]=useState({name:'',email:'',phone:'+229',password:'',role:'finance',city:'Cotonou',cities:['Cotonou']}),[opsSummary,setOpsSummary]=useState(null),[ledger,setLedger]=useState([]),[masterShareChoices,setMasterShareChoices]=useState({}),[cities,setCities]=useState([]),[allCommunes,setAllCommunes]=useState([]),[financeRestaurants,setFinanceRestaurants]=useState([]),[adminMenu,setAdminMenu]=useState([]),[selectedAdminRestaurant,setSelectedAdminRestaurant]=useState(''),[auditRows,setAuditRows]=useState([]),[restaurantRiders,setRestaurantRiders]=useState([]),[orderRiderChoice,setOrderRiderChoice]=useState({}),[communicationRecipient,setCommunicationRecipient]=useState(''),[riderPhone,setRiderPhone]=useState(''),[adminDish,setAdminDish]=useState({name:'',description:'',price:'',category:'',optionsText:'',imageUrl:''}),[topup,setTopup]=useState({restaurantId:'',amount:'',reference:''}),[cityForm,setCityForm]=useState({name:'',neighborhoods:'',deliveryZones:''}),[walletData,setWalletData]=useState(null),[commissionData,setCommissionData]=useState(null),[payoutRows,setPayoutRows]=useState([]),[payoutForm,setPayoutForm]=useState({amount:'',phoneNumber:user?.phone||'',network:'MTN'}),[commissionTopup,setCommissionTopup]=useState({amount:'',phone:user?.phone||'',network:'mtn'}),[lastFinancialPayment,setLastFinancialPayment]=useState(null),[commissionSettings,setCommissionSettings]=useState({commissionRate:10,deliveryFee:700,codMinimumBalance:1000}),[notifications,setNotifications]=useState([]),[err,setErr]=useState(''),[busy,setBusy]=useState(''),[otp,setOtp]=useState({}),[generatedDeliveryCodes,setGeneratedDeliveryCodes]=useState({}),[shop,setShop]=useState(null),[dish,setDish]=useState({name:'',description:'',price:'',category:'',stock:'',imageUrls:[],videoUrls:[],optionsText:''}),[dishImage,setDishImage]=useState(null),[dishVideo,setDishVideo]=useState(null),[mediaBusy,setMediaBusy]=useState(false),[mediaProgress,setMediaProgress]=useState(''),[shopForm,setShopForm]=useState({name:'',description:'',phone:'',address:'',city:user?.city||'Cotonou',deliveryZonesText:'',location:null}),[gpsStatus,setGpsStatus]=useState('GPS en attente');

 async function uploadProfilePhoto(file){if(!file)return;setProfileBusy(true);setProfileMessage('');setErr('');try{
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))throw new Error('Formats acceptés : JPG, PNG, WebP ou AVIF.');
  if(file.size>10*1024*1024)throw new Error('La photo ne doit pas dépasser 10 Mo.');
  const sig=await api('/auth/profile-upload-signature');
  const body=new FormData();body.append('file',file);body.append('api_key',sig.apiKey);body.append('timestamp',String(sig.timestamp));body.append('folder',sig.folder);body.append('signature',sig.signature);
  const response=await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,{method:'POST',body});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Téléversement de la photo impossible.');
  const url=result.secure_url.replace('/upload/','/upload/f_auto,q_auto:good,w_500,h_500,c_fill,g_face/');
  const saved=await api('/auth/profile',{method:'PATCH',body:JSON.stringify({profileImage:url})});setProfileImage(saved.user.profileImage);localStorage.setItem('dunu_user',JSON.stringify({...user,...saved.user}));setProfileMessage('Photo de profil mise à jour.');
 }catch(e){setErr(e.message)}finally{setProfileBusy(false)}}
 const refresh=async()=>{
  try{
   const [d,o]=await Promise.all([api('/dashboard'),api('/orders/mine')]);
   setData(d);setOrders(o);
   try{setNotifications(await api('/notifications'))}catch{}
   if(['admin','master','finance'].includes(user.role)){const summary=await api('/operations/summary');setOpsSummary(summary);try{setAnalytics(await api('/operations/analytics?days=7'))}catch{setAnalytics(null)}}
   if(user.role==='rider'){try{const [earnings,missions]=await Promise.all([api('/operations/rider/earnings'),api('/operations/rider/missions')]);setRiderEarnings(earnings);setRiderMissions(missions)}catch{setRiderEarnings(null);setRiderMissions([])}}
   if(['admin','finance'].includes(user.role)){const rows=await api('/finance/admin/ledger');setLedger(rows);try{setCommissionSettings(await api('/operations/commission-settings'));setFinanceSummary(await api('/operations/finance-summary'))}catch{setFinanceSummary(null)}}
   if(user.role==='restaurant'){try{const [own,riders,commission]=await Promise.all([api('/catalog/restaurant/me'),api('/catalog/restaurant/me/riders'),api('/finance/restaurant/me')]);setShop(own);setRestaurantRiders(riders);setCommissionData(commission)}catch{setShop(null);setRestaurantRiders([]);setCommissionData(null)}}
   if(user.role==='admin'){const [p,allAccounts,positions,cityRows,shops,ads,audit,feeRequests,zoneRequests]=await Promise.all([api('/operations/pending'),api('/operations/users'),api('/operations/riders/locations'),api('/operations/cities'),api('/operations/restaurants'),api('/ads'),api('/operations/audit'),api('/catalog/admin/delivery-fee-requests'),api('/catalog/admin/delivery-zone-requests')]);setDeliveryFeeRequests(feeRequests);setDeliveryZoneRequests(zoneRequests);setPending(p);setAccounts(allAccounts);setStaff(allAccounts.filter(x=>['admin','master','finance'].includes(x.role)));setRiderPositions(positions);setCities(cityRows);setFinanceRestaurants(shops);setAdCampaigns(ads);setAuditRows(audit)}else if(user.role==='master'){try{const [positions,audit,shops]=await Promise.all([api('/operations/riders/locations'),api('/operations/audit'),api('/operations/my-restaurants')]);setRiderPositions(positions);setAuditRows(audit);setFinanceRestaurants(shops)}catch{setRiderPositions([]);setAuditRows([])}}
   if(['restaurant','rider','master'].includes(user.role)){try{setWalletData(await api('/finance/wallet/me'))}catch{setWalletData(null)}}
   if(user.role==='admin'){try{setPayoutRows(await api('/finance/admin/payouts'))}catch{setPayoutRows([])}}
  }catch(e){setErr(e.message)}
 };


 async function checkFinancialPayment(){if(!lastFinancialPayment?.reference)return;setBusy('financial-status');setErr('');try{const result=await api(`/payments/feexpay/${encodeURIComponent(lastFinancialPayment.reference)}/status`);setLastFinancialPayment(v=>({...v,status:result.status}));setStaffSuccess(result.status==='SUCCESSFUL'?'Paiement confirmé. Votre portefeuille ou abonnement est mis à jour.':result.status==='FAILED'?'Paiement refusé par FeexPay.':'Paiement toujours en attente.');await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function rechargeCommission(e){e.preventDefault();setBusy('commission-topup');setErr('');try{const result=await api('/finance/restaurant/commission-topup',{method:'POST',body:JSON.stringify({amount:Number(commissionTopup.amount),phone:commissionTopup.phone,network:commissionTopup.network})});setLastFinancialPayment({reference:result.reference,purpose:'restaurant_topup',status:result.status||'PENDING'});setStaffSuccess(`Recharge initiée. Référence FeexPay : ${result.reference}. Le solde sera crédité après confirmation.`);setCommissionTopup(v=>({...v,amount:''}));await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function requestWalletPayout(e){e.preventDefault();setBusy('wallet-payout');setErr('');try{await api('/finance/wallet/withdraw',{method:'POST',body:JSON.stringify({amount:Number(payoutForm.amount),phoneNumber:payoutForm.phoneNumber,network:payoutForm.network})});setPayoutForm(v=>({...v,amount:''}));setStaffSuccess('Demande de reversement envoyée à l’administration nationale.');await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function reviewPayout(id,decision){setBusy(`payout-${id}`);setErr('');try{if(decision==='approve'){await api(`/finance/admin/payouts/${id}/approve`,{method:'PATCH',body:JSON.stringify({})})}else{await api(`/finance/admin/payouts/${id}/reject`,{method:'PATCH',body:JSON.stringify({reason:'Demande refusée par l’administration nationale'})})}await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function checkPayoutStatus(id){setBusy(`payout-${id}`);setErr('');try{const result=await api(`/finance/admin/payouts/${id}/status/refresh`,{method:'POST',body:JSON.stringify({})});setStaffSuccess(`Statut FeexPay : ${result.status}`);await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function cancelUnreferencedPayout(id){if(!window.confirm('Confirmez-vous avoir vérifié dans FeexPay qu’aucun transfert n’a été exécuté ?'))return;const confirmation=window.prompt('Pour confirmer, saisissez exactement : AUCUN VERSEMENT FEEXPAY');if(confirmation!=='AUCUN VERSEMENT FEEXPAY')return;setBusy(`payout-${id}`);setErr('');try{await api(`/finance/admin/payouts/${id}/cancel-unreferenced`,{method:'PATCH',body:JSON.stringify({confirmation})});setStaffSuccess('Demande annulée et conservée dans l’historique.');await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function retryPayout(id){if(!window.confirm('Créer une nouvelle demande distincte ? Vérifiez que l’ancienne demande est bien annulée et qu’aucun transfert FeexPay n’a été exécuté.'))return;setBusy(`payout-${id}`);setErr('');try{await api(`/finance/admin/payouts/${id}/retry`,{method:'POST',body:JSON.stringify({})});setStaffSuccess('Nouvelle demande créée ; elle attend une validation.');await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function uploadAdFile(file){if(!file)return;const localUrl=URL.createObjectURL(file);setAdLocalPreview(localUrl);setAdForm(v=>({...v,mediaUrl:'',publicId:''}));setAdBusy(true);setErr('');setAdProgress('Préparation du média…');try{const media=await uploadDunuAdMedia(file,adForm.mediaType,setAdProgress);if(!media?.url||!media?.publicId)throw new Error('Cloudinary n’a pas retourné le média. Réessayez avec un fichier JPG, PNG ou WebP.');setAdForm(v=>({...v,mediaUrl:media.url,publicId:media.publicId}));setStaffSuccess('Média publicitaire envoyé et optimisé sur Cloudinary.')}catch(e){setAdForm(v=>({...v,mediaUrl:'',publicId:''}));setErr(e.message||'Téléversement publicitaire impossible.')}finally{setAdBusy(false);setAdProgress('')}}
 async function saveAd(e){e.preventDefault();if(!adForm.mediaUrl){setErr('Le média n’a pas encore été téléversé. Sélectionnez une image ou une vidéo et attendez la fin de l’envoi.');return;}setAdBusy(true);setErr('');try{await api('/ads',{method:'POST',body:JSON.stringify(adForm)});setAdForm({title:'',description:'',mediaType:'image',mediaUrl:'',publicId:'',buttonLabel:'Découvrir',targetUrl:'/plats',placement:'home'});setAdLocalPreview('');await refresh();setStaffSuccess('Publicité publiée. Elle apparaîtra sur la page d’accueil.')}catch(e){setErr(e.message)}finally{setAdBusy(false)}}
 async function updateAd(id,patch){try{await api(`/ads/${id}`,{method:'PATCH',body:JSON.stringify(patch)});await refresh()}catch(e){setErr(e.message)}}
 async function deleteAd(id){if(!confirm('Supprimer définitivement cette campagne ?'))return;try{await api(`/ads/${id}`,{method:'DELETE'});await refresh()}catch(e){setErr(e.message)}}
 async function saveCommission(e){e.preventDefault();setBusy('commission');setErr('');try{const saved=await api('/operations/commission-settings',{method:'PUT',body:JSON.stringify({commissionRate:Number(commissionSettings.commissionRate),deliveryFee:Number(commissionSettings.deliveryFee),codMinimumBalance:Number(commissionSettings.codMinimumBalance)})});setCommissionSettings(saved);setStaffSuccess('Paramètres de commission enregistrés. Ils s’appliquent aux nouvelles commandes.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function assignMasterShare(entryId){const masterId=masterShareChoices[entryId];if(!masterId){setErr('Sélectionnez le Master qui couvre cette ville.');return;}setBusy(entryId);setErr('');try{await api(`/finance/admin/ledger/${entryId}/assign-master`,{method:'PATCH',body:JSON.stringify({masterId})});await refresh();setStaffSuccess('Part de 3 % affectée au Master sélectionné.');}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function markNotification(n){try{await api(`/notifications/${n._id}/read`,{method:'PATCH'});setNotifications(rows=>rows.map(x=>x._id===n._id?{...x,readAt:new Date().toISOString()}:x));return true}catch(e){setErr(e.message);return false}}
 async function enableBrowserNotifications(){
  if(!('Notification' in window)){setErr('Les notifications navigateur ne sont pas prises en charge sur cet appareil.');return}
  try{const permission=await window.Notification.requestPermission();setStaffSuccess(permission==='granted'?'Notifications de cet appareil activées.':"Autorisation de notification non accordée.");}catch(e){setErr(e.message||'Impossible d’activer les notifications.')}
 }
 async function openNotification(n){
  await markNotification(n);
  if(n.metadata?.roomId){setAdminTab('messages');return}
  if(n.metadata?.payoutId){setAdminTab('finance');return}
  if(n.metadata?.orderCode){navigate(`/track?code=${encodeURIComponent(n.metadata.orderCode)}`);return}
  if(n.link&&n.link!=='/dashboard'){navigate(n.link);return}
  if(['message','call'].includes(n.type)){setAdminTab('messages');return}
  if(n.type==='finance'){setAdminTab('finance');return}
  if(n.type==='order'||n.type==='delivery'){setAdminTab('orders');return}
  setAdminTab('overview');
 }

 useEffect(()=>{if(user)refresh()},[user]);
 useEffect(()=>{api('/catalog/registration-cities').then(setAllCommunes).catch(()=>setAllCommunes([]))},[]);
 useEffect(()=>{if(!['admin','master'].includes(user?.role))return;const timer=setInterval(()=>api('/operations/riders/locations').then(setRiderPositions).catch(()=>{}),15000);return()=>clearInterval(timer)},[user]);
 useEffect(()=>{
  if(!user||!token())return;
  const socket=io(import.meta.env.VITE_API_URL||undefined,{auth:{token:token()}});
  socket.on('notification:new',n=>setNotifications(rows=>[n,...rows.filter(x=>x._id!==n._id)].slice(0,100)));
  socket.on('order:new',()=>refresh());
  socket.on('order:payment-failed',()=>refresh());
  socket.on('message:new',m=>setConversationRows(rows=>[...rows,m].slice(-200)));
  return()=>socket.disconnect()
 },[user]);

 useEffect(()=>{
  if(user?.role!=='rider'||!token())return;
  const active=orders.filter(o=>['picked_up','on_the_way'].includes(o.status));
  if(!active.length){setGpsStatus('GPS activé pendant une livraison en cours');return}
  if(!window.isSecureContext){setGpsStatus('GPS indisponible : ouvrez DUNU en HTTPS');return}
  if(!navigator.geolocation){setGpsStatus('Ce navigateur ne prend pas en charge le GPS');return}
  const socket=io(import.meta.env.VITE_API_URL||undefined,{auth:{token:token()}});
  active.forEach(o=>socket.emit('order:watch',o.code));
  setGpsStatus('Demande d’autorisation GPS. Si le navigateur affiche une question, choisissez « Autoriser ».');
  const watch=navigator.geolocation.watchPosition(pos=>{socket.emit('location:update',{lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy});setGpsStatus(`Position envoyée · précision ±${Math.round(pos.coords.accuracy)} m`)},err=>setGpsStatus(err.code===1?'Accès GPS refusé. Android : Paramètres > Applications > navigateur > Autorisations > Position. iPhone : Réglages > Confidentialité et sécurité > Service de localisation > navigateur > Lorsque l’app est active. Revenez ensuite sur DUNU et réessayez.':err.code===2?'Position introuvable. Activez la localisation du téléphone et vérifiez que le mode économie d’énergie ne bloque pas le GPS.':'Le GPS met trop de temps à répondre. Rapprochez-vous d’une zone dégagée puis rechargez DUNU.'),{enableHighAccuracy:true,maximumAge:3000,timeout:20000});
  return()=>{navigator.geolocation.clearWatch(watch);socket.disconnect()}
 },[user,orders]);

 if(!user)return <main className="auth"><div className="panel"><h2>Connectez-vous pour accéder à votre espace</h2><Link className="primary" to="/login">Connexion</Link></div></main>;

 const operationalOrders=orders.filter(o=>o.status!=='cancelled'&&o.paymentStatus!=='failed'&&(o.paymentMethod!=='mobile_money'||o.paymentStatus==='paid'));
 const activeOrdersForList=operationalOrders.filter(o=>o.status!=='delivered');
 const deliveredOrdersForList=operationalOrders.filter(o=>o.status==='delivered');
 const unsuccessfulOrdersForList=orders.filter(o=>o.status==='cancelled'||o.paymentStatus==='failed'||(o.paymentMethod==='mobile_money'&&o.paymentStatus==='pending'&&o.status==='placed'));
 const activeOrderCount=activeOrdersForList.length;
 const deliveredOrderCount=deliveredOrdersForList.length;
 const Icon={client:ShoppingBag,restaurant:Store,rider:Bike,master:MapPin,admin:Shield,finance:Wallet}[user.role]||Shield;
 const next={restaurant:{placed:'accepted',accepted:'preparing',preparing:'ready'},rider:{ready:'picked_up',picked_up:'on_the_way',on_the_way:'delivered'},master:{placed:'accepted',accepted:'preparing',preparing:'ready',ready:'picked_up',picked_up:'on_the_way',on_the_way:'delivered'},admin:{placed:'accepted',accepted:'preparing',preparing:'ready',ready:'picked_up',picked_up:'on_the_way',on_the_way:'delivered'}};

 async function changeStatus(order,status){setBusy(order._id);try{const body={status};if(status==='delivered')body.otp=otp[order._id]||'';if(['admin','master'].includes(user.role)&&['picked_up','on_the_way','delivered'].includes(status))body.note='Action effectuée par '+(user.role==='admin'?'l’administration nationale':'le Master')+' à la demande du livreur.';await api(`/orders/${order._id}/status`,{method:'PATCH',body:JSON.stringify(body)});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function generateDeliveryCode(order){setBusy('otp-'+order._id);setErr('');try{const result=await api(`/orders/${order._id}/create-delivery-code`,{method:'POST'});setGeneratedDeliveryCodes(v=>({...v,[order._id]:result.otp}));await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}} 
 async function archiveFailedOrder(order){if(!confirm(`Retirer la commande ${order.code} de la liste active ? Son historique sera conservé.`))return;setBusy('archive-'+order._id);try{await api(`/orders/${order._id}`,{method:'DELETE'});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function decision(path,body){setBusy(path);try{await api(path,{method:'PATCH',body:JSON.stringify(body)});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function approvePendingUser(x){const assignment=pendingAssignments[x._id]||{};setBusy(x._id);setErr('');try{await api(`/operations/users/${x._id}/approve`,{method:'PATCH',body:JSON.stringify({role:assignment.role||x.role,city:assignment.city||(cities.some(c=>c.name===x.city)?x.city:'Cotonou')})});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 function updatePendingAssignment(id,patch){setPendingAssignments(v=>({...v,[id]:{...(v[id]||{}),...patch}}))}
 async function uploadDishImage(file){if(!file)return;setMediaBusy(true);setErr('');try{const media=await uploadDunuMedia(file,'image',setMediaProgress);setDish(v=>({...v,imageUrls:[media.url]}));setDishImage(media.url);setStaffSuccess(`Photo préparée : ${(media.bytesBefore/1024/1024).toFixed(2)} Mo → ${(media.bytesUploaded/1024/1024).toFixed(2)} Mo envoyés. Cloudinary applique ensuite la réduction avant stockage.`)}catch(e){setErr(e.message)}finally{setMediaBusy(false);setMediaProgress('')}}
 async function uploadDishVideo(file){if(!file)return;setMediaBusy(true);setErr('');try{const media=await uploadDunuMedia(file,'video',setMediaProgress);setDish(v=>({...v,videoUrls:[media.url]}));setDishVideo(media.url);setStaffSuccess('Vidéo optimisée par Cloudinary et ajoutée au plat.')}catch(e){setErr(e.message)}finally{setMediaBusy(false);setMediaProgress('')}}
 function parseDishOptions(text){return String(text||'').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const [head,raw]=line.split(':');const name=(head||'').replace(/\s*\(obligatoire\)\s*/i,'').trim();const required=/\(obligatoire\)/i.test(head||'');const choices=(raw||'').split(',').map(part=>{const [label,price]=part.split('=');return {name:(label||'').trim(),price:Number((price||'0').trim())}});return {name,required,choices}}).filter(x=>x.name&&x.choices.length&&x.choices.every(c=>c.name&&Number.isSafeInteger(c.price)&&c.price>=0))}
async function createDish(e){e.preventDefault();setBusy('dish');try{const options=parseDishOptions(dish.optionsText);await api('/catalog/menu',{method:'POST',body:JSON.stringify({...dish,options,price:Number(dish.price),...(dish.stock!==''?{stock:Number(dish.stock)}:{})})});setDish({name:'',description:'',price:'',category:'',stock:'',imageUrls:[],videoUrls:[],optionsText:''});setDishImage(null);setDishVideo(null);await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
async function loadAdminMenu(id){setSelectedAdminRestaurant(id);if(!id){setAdminMenu([]);return}try{const data=await api(`/catalog/admin/restaurants/${id}/menu`);setAdminMenu(data.menu||[])}catch(e){setErr(e.message)}}
async function createAdminDish(e){e.preventDefault();if(!selectedAdminRestaurant)return;setBusy('admin-dish');try{await api('/catalog/menu',{method:'POST',body:JSON.stringify({...adminDish,options:parseDishOptions(adminDish.optionsText),imageUrls:adminDish.imageUrl?[adminDish.imageUrl]:[],restaurantId:selectedAdminRestaurant,price:Number(adminDish.price)})});setAdminDish({name:'',description:'',price:'',category:'',optionsText:'',imageUrl:''});await loadAdminMenu(selectedAdminRestaurant)}catch(e){setErr(e.message)}finally{setBusy('')}}
async function addRestaurantRider(e){e.preventDefault();setBusy('restaurant-rider');try{await api('/catalog/restaurant/me/riders',{method:'POST',body:JSON.stringify({phone:riderPhone})});setRiderPhone('');await refresh();setStaffSuccess('Livreur ajouté à votre équipe.')}catch(e){setErr(e.message)}finally{setBusy('')}}
async function removeRestaurantRider(id){try{await api(`/catalog/restaurant/me/riders/${id}`,{method:'DELETE'});await refresh()}catch(e){setErr(e.message)}}
 async function captureShopLocation(){if(!navigator.geolocation){setErr('La géolocalisation n’est pas disponible sur cet appareil.');return}setBusy('shop-gps');navigator.geolocation.getCurrentPosition(pos=>{setShopForm(v=>({...v,location:{lat:pos.coords.latitude,lng:pos.coords.longitude}}));setStaffSuccess('Position du restaurant enregistrée.');setBusy('')},e=>{setErr(e.code===1?'Autorisez la localisation pour enregistrer la position du restaurant.':'Position GPS indisponible.');setBusy('')},{enableHighAccuracy:true,timeout:12000,maximumAge:60000})}
 async function createShop(e){e.preventDefault();setBusy('shop');setErr('');try{const deliveryZones=[...new Set(String(shopForm.deliveryZonesText||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];if(!deliveryZones.length)throw new Error('Indiquez au moins une zone ou un quartier desservi.');await api('/catalog/restaurants',{method:'POST',body:JSON.stringify({...shopForm,deliveryZones})});await refresh();setStaffSuccess('Demande envoyée avec vos zones de livraison. Elles seront activées après validation DUNU.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function toggleOnline(){try{const result=await api('/operations/rider/availability',{method:'PATCH',body:JSON.stringify({online:!data?.isOnline})});setData(v=>({...v,isOnline:result.online}))}catch(e){setErr(e.message)}}
 async function acceptMission(orderId){setBusy(orderId);setErr('');try{await api(`/operations/rider/missions/${orderId}/accept`,{method:'PATCH'});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function createStaff(e){e.preventDefault();setBusy('staff');setErr('');setStaffSuccess('');try{await api('/operations/users',{method:'POST',body:JSON.stringify(staffForm)});setStaffForm({name:'',email:'',phone:'+229',password:'',role:'finance',city:'Cotonou',cities:['Cotonou']});await refresh();setStaffSuccess('Compte créé. Transmettez le mot de passe provisoire par un canal confidentiel.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function createCity(e){e.preventDefault();setBusy('city');setErr('');try{const neighborhoods=cityForm.neighborhoods.split(',').map(x=>x.trim()).filter(Boolean);const deliveryZones=cityForm.deliveryZones.split(',').map(name=>({name:name.trim(),fee:700,active:true})).filter(x=>x.name);await api('/operations/cities',{method:'POST',body:JSON.stringify({name:cityForm.name,neighborhoods,deliveryZones})});setCityForm({name:'',neighborhoods:'',deliveryZones:''});await refresh();setStaffSuccess('Ville et zones enregistrées.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function updateCity(city,patch){setBusy(`city-${city._id}`);setErr('');try{await api(`/operations/cities/${city._id}`,{method:'PATCH',body:JSON.stringify(patch)});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function reviewZoneRequest(shopId,requestId,decisionValue){setBusy(`zone-request-${requestId}`);setErr('');try{await api(`/catalog/admin/delivery-zone-requests/${shopId}/${requestId}`,{method:'PATCH',body:JSON.stringify({decision:decisionValue,note:decisionValue==='reject'?'Demande refusée par DUNU':''})});await refresh();setStaffSuccess(decisionValue==='approve'?'Zones du restaurant validées.':'Demande de zones refusée.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function proposeShopZones(e){e.preventDefault();setBusy('shop-zones');setErr('');try{const zones=[...new Set(shopZoneProposal.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];await api('/catalog/restaurant/me/delivery-zones',{method:'PUT',body:JSON.stringify({zones})});setShopZoneProposal('');await refresh();setStaffSuccess('Proposition transmise à DUNU. Vos zones actuelles restent actives en attendant la validation.')}catch(e){setErr(e.message)}finally{setBusy('')}}
 async function creditRestaurant(e){e.preventDefault();setBusy('topup');setErr('');try{await api('/finance/admin/restaurant-credit',{method:'POST',body:JSON.stringify({restaurantId:topup.restaurantId,amount:Number(topup.amount),reference:topup.reference})});setTopup({restaurantId:'',amount:'',reference:''});await refresh();setStaffSuccess('Crédit du restaurant enregistré.')}catch(e){setErr(e.message)}finally{setBusy('')}}

 return <main className={user.role!=='client'?'page dashboard-page national-dashboard':'page dashboard-page'}>
 <div className={user.role!=='client'?'admin-workspace':''}>
 {user.role!=='client'&&<aside className={`admin-sidebar${adminSidebarOpen?' is-open':''}`} aria-label="Navigation de l'espace membre">
  <div className="admin-sidebar-brand"><img src="/dunu-logo.webp" alt="DUNU BÉNIN"/><div><b>DUNU BÉNIN</b><small>{roles[user.role]||'Espace membre'}</small></div></div>
  <div className="admin-sidebar-caption">ESPACE MEMBRE · {String(user.role).toUpperCase()}</div>
  <nav className="admin-sidebar-nav" aria-label="Navigation principale">
   {navGroups.map(group=><section className="admin-nav-group" key={group.title}>
    <div className="admin-nav-group-title">{group.title}</div>
    {group.items.map(([key,label])=>{const icons={overview:House,orders:ShoppingBag,approvals:Shield,restaurants:Store,users:CircleUserRound,staff:Wallet,cities:MapPin,riders:Bike,missions:Bike,finance:Wallet,settings:Shield,messages:MessageCircle,notifications:Bell,audit:Shield,ads:Activity,shop:Store};const NavIcon=icons[key]||ChevronRight;return <button type="button" key={key} className={adminTab===key?'admin-nav-item active':'admin-nav-item'} aria-current={adminTab===key?'page':undefined} onClick={()=>{setAdminTab(key);setErr('');setAdminSidebarOpen(false);if(window.matchMedia('(max-width: 900px)').matches)document.querySelector('.admin-content')?.scrollIntoView({behavior:'smooth',block:'start'})}}><NavIcon size={17}/><span>{label}</span>{adminTab===key&&<i aria-hidden="true"/>}</button>})}
   </section>)}
  </nav>
  <div className="admin-sidebar-foot"><span className="admin-status-dot"/> Accès sécurisé · DUNU BÉNIN</div>
 </aside>}
 <div className={user.role!=='client'?'admin-content':''}>
 {user.role!=='client'&&<>
 <div className="admin-mobile-title"><span>ESPACE MEMBRE · DUNU BÉNIN</span><b>{dashboardTabs.find(([key])=>key===adminTab)?.[1]||roles[user.role]}</b></div>
 <header className="admin-topbar">
  <button type="button" className="admin-menu-toggle" aria-label="Afficher ou masquer le menu" aria-expanded={adminSidebarOpen} onClick={()=>setAdminSidebarOpen(v=>!v)}><Menu size={20}/></button>
  <div className="admin-topbar-context"><span>ESPACE DE PILOTAGE · DUNU BÉNIN</span><strong>{dashboardTabs.find(([key])=>key===adminTab)?.[1]||roles[user.role]||'Espace membre'}</strong><small>{user.role==='admin'?'Vue nationale · Toutes les villes du Bénin':`Territoire : ${user.role==='master'?(user.masterCities?.join(', ')||user.city||'Bénin'):(user.city||'Bénin')}`}</small></div>
  <label className="admin-dashboard-search"><Search size={17}/><input aria-label="Rechercher une rubrique du menu" value={dashboardMenuSearch} onChange={e=>{setDashboardMenuSearch(e.target.value);setAdminSidebarOpen(true)}} placeholder="Rechercher une rubrique…"/></label>
  <div className="admin-topbar-actions">
   <button type="button" className="admin-top-icon" aria-label="Ouvrir les notifications" onClick={()=>setAdminTab('notifications')}><Bell size={19}/>{notifications.filter(n=>!n.readAt).length>0&&<i>{Math.min(99,notifications.filter(n=>!n.readAt).length)}</i>}</button>
   <div className="admin-top-profile"><div className="admin-top-avatar">{profileImage?<img src={profileImage} alt="Photo de profil"/>:<UserRound size={22}/>}</div><div className="admin-top-profile-copy"><b>{user.name}</b><small><ShieldCheck size={12}/> {roles[user.role]||'Membre DUNU'}</small></div><label className="admin-profile-edit" title="Modifier ma photo" aria-label="Modifier ma photo">{profileBusy?'…':'Photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={profileBusy} onChange={e=>{uploadProfilePhoto(e.target.files?.[0]);e.target.value=''}}/></label></div>
  </div>
 </header>
 <section className="admin-welcome"><div><span className="admin-welcome-kicker"><Activity size={14}/> ESPACE DE PILOTAGE · DUNU BÉNIN</span><h1>Bonjour {user.name?.split(' ')[0]||'Membre'} 👋</h1><p>Retrouvez vos opérations, vos indicateurs et vos outils dans un espace unique.</p></div><div className="admin-welcome-status"><span></span> {user.role==='admin'?'Accès national complet':user.role==='master'?'Territoire attribué':user.role==='finance'?'Accès financier':'Compte professionnel'}</div></section>
 </>}
 {user.role==='client'&&<section className="client-hero"><div className="client-hero-brand"><img src="/dunu-logo.webp" alt="DUNU BÉNIN"/><span>On commande, on savoure, on partage.</span><button type="button" className="client-hero-bell" aria-label="Ouvrir les notifications" onClick={()=>{setClientTab('notifications');setShowAllClientNotifications(false)}}><Bell size={21}/>{notifications.some(n=>!n.readAt)&&<i>{Math.min(99,notifications.filter(n=>!n.readAt).length)}</i>}</button></div><div className="client-hero-profile"><div className="client-avatar-large">{profileImage?<img src={profileImage} alt="Photo de profil"/>:<CircleUserRound size={42}/>}</div><div className="client-hero-greeting"><span>MON ESPACE · DUNU BÉNIN</span><h1>Bonjour {user.name?.split(' ')[0]||'et bienvenue'} 👋</h1><p><MapPin size={15}/> {user.city||'Bénin'}</p></div><label className="client-profile-photo" title="Ajouter ou modifier ma photo">{profileBusy?'…':'Mon profil'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={profileBusy} onChange={e=>{uploadProfilePhoto(e.target.files?.[0]);e.target.value=''}}/></label></div></section>}
 {user.role==='client'&&clientTab==='overview'&&<><div className="client-search-shortcut"><Search size={19}/><span>Que souhaitez-vous manger ?</span><Link to="/plats">Explorer</Link></div><div className="client-quick-actions"><Link to="/restaurants"><Store size={25}/><b>Restaurants</b></Link><Link to="/plats"><Utensils size={25}/><b>Plats</b></Link><Link to="/track"><Bike size={25}/><b>Suivre une commande</b></Link><button type="button" onClick={()=>setClientTab('messages')}><MessageCircle size={25}/><b>Aide & messages</b></button></div></>}
 {err&&<p className="error">{err}</p>}
 {tabVisible('audit')&&['admin','master'].includes(user.role)&&<section className="panel"><h2>Journal des actions</h2><p>{user.role==='master'?`Historique limité à ${user.city}.`:'Historique national des opérations sensibles.'}</p>{auditRows.map(row=><div className="order-row" key={row._id}><div><b>{row.action}</b><small>{row.actor?.name||'Utilisateur'} ({row.actorRole}) · {row.restaurant?.name||row.targetType} · {new Date(row.createdAt).toLocaleString('fr-FR')}</small><small>{JSON.stringify(row.details||{})}</small></div></div>)}{!auditRows.length&&<p className="muted">Aucune action enregistrée.</p>}</section>}
 {tabVisible('ads')&&user.role==='admin'&&<section className="panel ad-admin-panel"><div className="pagehead"><div><h2>Gestion des publicités</h2><p>Ajoutez des photos ou vidéos depuis votre téléphone. Les fichiers sont optimisés et hébergés sur Cloudinary.</p></div><button className="secondary" type="button" onClick={refresh}><RefreshCw size={15}/> Actualiser</button></div><form className="dish-form" onSubmit={saveAd}><label>Titre de la publicité<input required minLength={2} maxLength={120} value={adForm.title} onChange={e=>setAdForm(v=>({...v,title:e.target.value}))} placeholder="Ex. Offre spéciale du week-end"/></label><label>Description<textarea maxLength={500} value={adForm.description} onChange={e=>setAdForm(v=>({...v,description:e.target.value}))} placeholder="Message court pour attirer les clients"/></label><label>Type de média<select value={adForm.mediaType} onChange={e=>{setAdForm(v=>({...v,mediaType:e.target.value,mediaUrl:'',publicId:''}));setAdLocalPreview('')}}><option value="image">Photo</option><option value="video">Vidéo (90 secondes maximum)</option></select></label><label>Photo ou vidéo<input required type="file" accept={adForm.mediaType==='image'?'image/jpeg,image/png,image/webp,image/avif':'video/mp4,video/webm,video/quicktime'} disabled={adBusy} onChange={e=>{const file=e.target.files?.[0];if(file)uploadAdFile(file);}}/></label><label>Texte du bouton<input maxLength={40} value={adForm.buttonLabel} onChange={e=>setAdForm(v=>({...v,buttonLabel:e.target.value}))}/></label><label>Destination (lien interne)<select value={adForm.targetUrl} onChange={e=>setAdForm(v=>({...v,targetUrl:e.target.value}))}><option value="/plats">Catalogue des plats</option><option value="/restaurants">Restaurants</option><option value="/track">Suivi de commande</option></select></label><label>Emplacement<select value={adForm.placement} onChange={e=>setAdForm(v=>({...v,placement:e.target.value}))}><option value="home">Page d’accueil</option><option value="all">Page d’accueil et emplacements publicitaires</option></select></label>{(adLocalPreview||adForm.mediaUrl)&&<div className="ad-upload-preview">{adForm.mediaType==='video'?<video src={adLocalPreview||adForm.mediaUrl} controls/>:<img src={adLocalPreview||adForm.mediaUrl} alt="Aperçu publicité"/>}<small>{adBusy?'Aperçu local · téléversement en cours…':adForm.mediaUrl?'Média envoyé et prêt à publier':'Aperçu local · téléversement non terminé'}</small></div>}{adProgress&&<p className="muted" role="status">{adProgress}</p>}<button className="primary" disabled={adBusy||!adForm.mediaUrl}>{adBusy?'Envoi en cours…':'Publier la publicité'}</button></form><h3>Campagnes enregistrées ({adCampaigns.length})</h3>{adCampaigns.map(ad=><div className="order-row ad-campaign-row" key={ad._id}><div className="ad-campaign-thumb">{ad.mediaType==='video'?<video src={ad.mediaUrl} muted/>:<img src={ad.mediaUrl} alt={ad.title}/>}<b>{ad.title}</b><small>{ad.placement==='all'?'Accueil et autres emplacements':'Page d’accueil'} · {ad.active?'Active':'Désactivée'}</small></div><div className="actions"><button type="button" className="secondary" onClick={()=>updateAd(ad._id,{active:!ad.active})}>{ad.active?'Désactiver':'Activer'}</button><button type="button" className="secondary" onClick={()=>deleteAd(ad._id)}>Supprimer</button></div></div>)}{!adCampaigns.length&&<p className="muted">Aucune campagne publicitaire enregistrée.</p>}</section>}
 {tabVisible('overview')&&<div className="stats"><article><Icon/><small>Profil</small><b>{roles[user.role]}</b></article><article><ShoppingBag/><small>Commandes actives</small><b>{activeOrderCount}</b></article><article><ShoppingBag/><small>Livrées</small><b>{deliveredOrderCount}</b></article><article><MapPin/><small>{user.role==='admin'?'Périmètre':'Zone'}</small><b>{user.role==='admin'?'National · Tout le Bénin':(user.city||'Bénin')}</b></article></div>}
 {tabVisible('overview')&&<>{opsSummary&&<section className="panel"><h2>{user.role==='master'?`Activité de ${opsSummary.city||user.city}`:'Vue générale DUNU'}</h2><div className="stats"><article><ShoppingBag/><small>Commandes actives</small><b>{opsSummary.orders||0}</b></article><article><ShoppingBag/><small>En attente de traitement</small><b>{opsSummary.pendingOrders||0}</b></article><article><ShoppingBag/><small>Paiement à confirmer</small><b>{opsSummary.awaitingPaymentOrders||0}</b></article><article><ShoppingBag/><small>Livrées</small><b>{opsSummary.deliveredOrders||0}</b></article><article><ShoppingBag/><small>Annulées / échouées</small><b>{opsSummary.unsuccessfulOrders||0}</b></article><article><Store/><small>Restaurants</small><b>{opsSummary.restaurants||0}</b></article><article><Shield/><small>Restaurants à valider</small><b>{opsSummary.pendingRestaurants||0}</b></article><article><Bike/><small>Livreurs actifs</small><b>{opsSummary.riders||0}</b></article><article><Wallet/><small>Clients</small><b>{opsSummary.clients||0}</b></article>{opsSummary.platformCommissionXof!==undefined&&<article><Wallet/><small>Commissions plateforme</small><b>{Number(opsSummary.platformCommissionXof).toLocaleString('fr-FR')} FCFA</b></article>}</div></section>}</>}
 {tabVisible('overview')&&analytics&&<section className="panel analytics-panel"><div className="pagehead"><div><h2>Activité des {analytics.days} derniers jours</h2><p>Commandes créées par jour · chiffres issus de la base DUNU.</p></div><button type="button" className="secondary" onClick={()=>api('/operations/analytics?days=30').then(setAnalytics).catch(e=>setErr(e.message))}>Voir 30 jours</button></div><div className="analytics-summary"><div><small>Commandes sur la période</small><b>{analytics.totals.orders}</b></div><div><small>Livrées</small><b>{analytics.totals.delivered}</b></div><div><small>Volume brut des commandes</small><b>{Number(analytics.totals.gross||0).toLocaleString('fr-FR')} FCFA</b></div>{user.role!=='master'&&<div><small>Commissions enregistrées</small><b>{Number(analytics.totals.platformCommissionsRecorded||0).toLocaleString('fr-FR')} FCFA</b></div>}</div><div className="analytics-bars" role="img" aria-label="Graphique des commandes par jour">{analytics.points.map(point=>{const max=Math.max(1,...analytics.points.map(x=>x.orders));return <div className="analytics-bar-column" key={point.date}><b>{point.orders}</b><div className="analytics-bar-track"><i style={{height:`${Math.max(4,point.orders/max*100)}%`}}/></div><small>{new Date(`${point.date}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit'})}</small></div>})}</div></section>}
 {tabVisible('cities')&&<>{user.role==='admin'&&<section className="panel"><h2>Référentiel national des villes et zones</h2><p>Les 77 communes sont préchargées pour les inscriptions. Activez ici uniquement les communes ouvertes au catalogue et à la livraison ; les autres restent disponibles comme lieu de résidence.</p><form className="dish-form" onSubmit={createCity}><label>Nouvelle ville<input required minLength="2" value={cityForm.name} onChange={e=>setCityForm(v=>({...v,name:e.target.value}))} placeholder="Ex. Porto-Novo"/></label><label>Quartiers (séparés par des virgules)<textarea value={cityForm.neighborhoods} onChange={e=>setCityForm(v=>({...v,neighborhoods:e.target.value}))} placeholder="Akron, Ouando, Tokpota"/></label><label>Zones de livraison (séparées par des virgules)<textarea value={cityForm.deliveryZones} onChange={e=>setCityForm(v=>({...v,deliveryZones:e.target.value}))} placeholder="Centre-ville, Zone nord"/></label><button className="primary" disabled={busy==='city'}>{busy==='city'?'Enregistrement…':'Ajouter la ville'}</button></form><h3>Villes configurées</h3>{cities.map(c=><div className="order-row" key={c._id}><div><b>{c.name}</b><small>{(c.neighborhoods||[]).length} quartiers · {(c.deliveryZones||[]).length} zones de livraison · {c.active?'Active':'Désactivée'}</small></div><div className="actions"><button className="secondary" disabled={!!busy} onClick={()=>{const value=prompt(`Quartiers de ${c.name}, séparés par des virgules`,(c.neighborhoods||[]).join(', '));if(value!==null)updateCity(c,{neighborhoods:value.split(',').map(x=>x.trim()).filter(Boolean)})}}>Modifier quartiers</button><button className="secondary" disabled={!!busy} onClick={()=>{const value=prompt(`Zones de livraison de ${c.name}, séparées par des virgules`,(c.deliveryZones||[]).map(x=>x.name).join(', '));if(value!==null){const names=[...new Set(value.split(/[\n,;]+/).map(name=>name.trim()).filter(Boolean))];if(!names.length){setErr('Une commune active doit conserver au moins une zone.');return;}updateCity(c,{deliveryZones:names.map(name=>({name,fee:(c.deliveryZones||[]).find(z=>z.name===name)?.fee??700,active:true}))})}}}>Modifier zones</button><button className="secondary" disabled={!!busy} onClick={()=>updateCity(c,{active:!c.active})}>{c.active?'Désactiver':'Activer'}</button></div></div>)}{!cities.length&&<p className="muted">Aucune ville configurée. Les villes des restaurants validés sont toutefois proposées aux clients.</p>}</section>}</>}

 {tabVisible('settings')&&user.role==='admin'&&<section className="panel"><h2>Répartition contractuelle DUNU · 90 / 3 / 7</h2><p>Ces taux sont fixes et s'appliquent aux ventes de plats comme aux frais de livraison. Ils ne sont pas modifiables depuis ce formulaire.</p><div className="stats"><article><Store/><small>Restaurant sur les plats</small><b>90 %</b></article><article><MapPin/><small>Master sur plats et livraison</small><b>3 %</b></article><article><Shield/><small>DUNU sur plats et livraison</small><b>7 %</b></article><article><Bike/><small>Livreur sur la livraison</small><b>90 %</b></article></div><form className="dish-form" onSubmit={saveCommission}><label>Frais de livraison par défaut (FCFA)<input type="number" min="0" max="100000" step="1" required value={commissionSettings.deliveryFee} onChange={e=>setCommissionSettings(v=>({...v,deliveryFee:e.target.value}))}/></label><button className="primary" disabled={busy==='commission'}>{busy==='commission'?'Enregistrement…':'Enregistrer les frais de livraison'}</button></form>{staffSuccess&&<p className="success">{staffSuccess}</p>}</section>}

 {tabVisible('messages')&&<CallPanel user={user} initialRecipientId={communicationRecipient} listenIncoming={false}/ >}

  {tabVisible('notifications')&&<section className="panel notification-center"><div className="pagehead"><div><h2>Centre de notifications</h2><p>{notifications.filter(n=>!n.readAt).length} notification(s) non lue(s)</p></div><button className="secondary" onClick={enableBrowserNotifications}>Activer sur cet appareil</button><button className="secondary" disabled={!notifications.some(n=>!n.readAt)} onClick={async()=>{try{await api('/notifications/read-all',{method:'PATCH'});setNotifications(rows=>rows.map(x=>({...x,readAt:new Date().toISOString()})))}catch(e){setErr(e.message)}}}>Tout marquer comme lu</button></div>{notifications.length?notifications.slice(0,(user.role==='client'?showAllClientNotifications:showAllNotifications)?100:2).map(n=><div className={`notification-row ${n.readAt?'is-read':'is-unread'}`} key={n._id}><button type="button" className="notification-open" onClick={()=>openNotification(n)}><span className="notification-unread-dot" aria-hidden="true"/><span className="notification-copy"><b>{n.title}</b><small>{n.body}</small><small>{new Date(n.createdAt).toLocaleString('fr-FR')}</small></span><span className="notification-action">Ouvrir →</span></button>{!n.readAt&&<button type="button" className="secondary notification-read" onClick={()=>markNotification(n)}>Marquer lu</button>}</div>):<div className="notification-empty"><Bell size={24}/><b>Aucune notification pour le moment</b><p>Les nouvelles commandes, messages, appels et opérations financières apparaîtront ici.</p></div>}{notifications.length>2&&<button type="button" className="client-notifications-more" onClick={()=>user.role==='client'?setShowAllClientNotifications(v=>!v):setShowAllNotifications(v=>!v)}>{(user.role==='client'?showAllClientNotifications:showAllNotifications)?'Afficher moins':'Voir toutes les notifications'} <ChevronRight size={16}/></button>}</section>}



 {tabVisible('finance')&&<>{user.role==='admin'&&<section className="panel"><h2>Opérations financières nationales</h2><p>Créditez le portefeuille d’un restaurant uniquement après vérification effective de la recharge et de sa référence de paiement.</p><form className="dish-form" onSubmit={creditRestaurant}><label>Restaurant<select required value={topup.restaurantId} onChange={e=>setTopup(v=>({...v,restaurantId:e.target.value}))}><option value="">Choisir un restaurant</option>{financeRestaurants.map(r=><option key={r._id} value={r._id}>{r.name} · {r.city} · Solde {Number(r.walletBalance||0).toLocaleString('fr-FR')} FCFA</option>)}</select></label><label>Montant à créditer (FCFA)<input required type="number" min="1" step="1" value={topup.amount} onChange={e=>setTopup(v=>({...v,amount:e.target.value}))}/></label><label>Référence vérifiée<input required minLength="3" value={topup.reference} onChange={e=>setTopup(v=>({...v,reference:e.target.value}))} placeholder="Référence unique de transaction"/></label><button className="primary" disabled={busy==='topup'||!financeRestaurants.length}>{busy==='topup'?'Traitement…':'Créditer le portefeuille'}</button></form><small>Cette opération ajoute une écriture au journal et augmente le solde du restaurant. Elle ne déclenche pas de paiement bancaire ou Mobile Money.</small></section>}</>}

 {tabVisible('finance')&&['restaurant','rider','master'].includes(user.role)&&walletData&&<section className="panel member-wallet-panel"><div className="pagehead"><div><h2>Mon portefeuille DUNU</h2><p>Solde calculé à partir des écritures financières confirmées.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Actualiser</button></div><div className="stats"><article><Wallet/><small>Solde total</small><b>{Number(walletData.balance||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Montant réservé</small><b>{Number(walletData.reserved||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Disponible au reversement</small><b>{Number(walletData.available||0).toLocaleString('fr-FR')} FCFA</b></article></div><h3>Dernières écritures</h3>{walletData.entries?.slice(0,12).map(entry=><div className="order-row" key={entry._id}><div><b>{entry.description||entry.kind}</b><small>{entry.reference||'Sans référence'} · {new Date(entry.createdAt).toLocaleString('fr-FR')}</small></div><b>{entry.direction==='debit'?'-':'+'}{Number(entry.amount||0).toLocaleString('fr-FR')} FCFA</b></div>)}{!walletData.entries?.length&&<p className="muted">Aucune écriture disponible.</p>}<h3>Demander un reversement Mobile Money</h3><form className="dish-form wallet-payout-form" onSubmit={requestWalletPayout}><label>Montant disponible (FCFA)<input required type="number" min="50" max={Math.max(50,Number(walletData.available||0))} step="1" value={payoutForm.amount} onChange={e=>setPayoutForm(v=>({...v,amount:e.target.value}))} placeholder="Montant à retirer"/></label><label>Numéro Mobile Money<input required inputMode="numeric" value={payoutForm.phoneNumber} onChange={e=>setPayoutForm(v=>({...v,phoneNumber:e.target.value}))} placeholder="22901XXXXXXXX"/></label><label>Réseau<select value={payoutForm.network} onChange={e=>setPayoutForm(v=>({...v,network:e.target.value}))}><option value="MTN">MTN</option><option value="MOOV">Moov</option><option value="CELTIIS BJ">Celtiis</option></select></label><button className="primary" disabled={busy==='wallet-payout'||Number(payoutForm.amount||0)>Number(walletData.available||0)}>{busy==='wallet-payout'?'Envoi…':'Demander le reversement'}</button></form>{walletData.payoutRequests?.length>0&&<><h3>Historique des reversements</h3>{walletData.payoutRequests.slice(0,8).map(item=><div className="order-row" key={item._id}><div><b>{Number(item.amount).toLocaleString('fr-FR')} FCFA · {item.network}</b><small>{item.phoneNumber} · {new Date(item.createdAt).toLocaleString('fr-FR')}</small></div><span className="status">{item.status}</span></div>)}</>}</section>}
  {user.role==='restaurant'&&tabVisible('finance')&&walletData&&<section className="panel restaurant-commission-wallet"><div className="pagehead"><div><h2>Portefeuille Commission</h2><p>Réservé exclusivement aux commandes payées à domicile ou à la livraison. Les paiements en ligne ne débitent jamais ce portefeuille.</p></div></div><div className="stats"><article><Wallet/><small>Solde Commission</small><b>{Number(walletData.commissionBalance||0).toLocaleString('fr-FR')} FCFA</b></article><article><Shield/><small>Montant réservé aux commandes en cours</small><b>{Number(walletData.commissionReserved||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Disponible pour nouvelles commandes</small><b>{Number(walletData.commissionAvailable??walletData.commissionBalance??0).toLocaleString('fr-FR')} FCFA</b></article><article><Activity/><small>Seuil de fonctionnement</small><b>1 000 FCFA</b></article><article><Activity/><small>Commandes à la livraison</small><b>{walletData.canReceiveOrders?'Activées':'Recharge nécessaire'}</b></article></div><p>Pour chaque vente payée à la livraison, 10 % du sous-total des plats sont débités de ce portefeuille : 7 % pour DUNU et 3 % pour le Master. Le restaurant reçoit directement 100 % du prix des plats auprès du client.</p>{lastFinancialPayment?.purpose==='restaurant_topup'&&<div className="order-row"><div><b>Dernière recharge · {lastFinancialPayment.reference}</b><small>Statut : {lastFinancialPayment.status}</small></div><button className="secondary" disabled={busy==='financial-status'} onClick={checkFinancialPayment}>Vérifier la recharge</button></div>}<h3>Recharger le portefeuille Commission</h3><form className="dish-form" onSubmit={rechargeCommission}><label>Montant (FCFA)<input required type="number" min="1000" max="2000000" step="1" value={commissionTopup.amount} onChange={e=>setCommissionTopup(v=>({...v,amount:e.target.value}))} placeholder="Ex. 5 000"/></label><label>Téléphone Mobile Money<input required inputMode="numeric" value={commissionTopup.phone} onChange={e=>setCommissionTopup(v=>({...v,phone:e.target.value}))} placeholder="22901XXXXXXXX"/></label><label>Opérateur<select value={commissionTopup.network} onChange={e=>setCommissionTopup(v=>({...v,network:e.target.value}))}><option value="mtn">MTN</option><option value="moov">Moov</option><option value="celtiis">Celtiis</option></select></label><button className="primary" disabled={busy==='commission-topup'||!commissionTopup.amount}>{busy==='commission-topup'?'Initiation…':'Recharger avec FeexPay'}</button></form><h3>Historique du portefeuille Commission</h3>{commissionData?.entries?.length?commissionData.entries.slice(0,20).map(entry=><div className="order-row" key={entry._id}><div><b>{entry.description||entry.kind}</b><small>{entry.reference||'Sans référence'} · {new Date(entry.createdAt).toLocaleString('fr-FR')}</small></div><b>{entry.direction==='debit'?'-':'+'}{Number(entry.amount).toLocaleString('fr-FR')} FCFA</b></div>):<p className="muted">Aucune recharge ou commission enregistrée.</p>}</section>}
 {tabVisible('finance')&&financeSummary&&<section className="panel"><h2>Synthèse financière consolidée</h2><div className="stats"><article><Wallet/><small>Commissions plateforme créditées</small><b>{Number(financeSummary.platformCommissionCredits||0).toLocaleString('fr-FR')} FCFA</b></article><article><Store/><small>Crédits restaurants historiques</small><b>{Number(financeSummary.restaurantCredits||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Reversements restaurants effectués</small><b>{Number(ledger.filter(e=>e.accountType==='restaurant_proceeds'&&e.kind==='withdrawal'&&e.direction==='debit'&&e.status!=='reversed').reduce((a,e)=>a+Number(e.amount||0),0)).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Solde disponible restaurants</small><b>{Math.max(0,Number(financeSummary.restaurantCredits||0)-ledger.filter(e=>e.accountType==='restaurant_proceeds'&&e.kind==='withdrawal'&&e.direction==='debit'&&e.status!=='reversed').reduce((a,e)=>a+Number(e.amount||0),0)).toLocaleString('fr-FR')} FCFA</b></article><article><Bike/><small>Crédits livreurs (90 %)</small><b>{Number(financeSummary.riderCredits||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Parts Masters (3 %) disponibles</small><b>{Number(financeSummary.masterCredits||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Parts Masters à affecter</small><b>{Number(financeSummary.pendingMasterCredits||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Écritures non annulées</small><b>{financeSummary.entryCount||0}</b></article></div><small>Frais de livraison reçus : {Number(financeSummary.deliveryFeesCollected||0).toLocaleString('fr-FR')} FCFA · Répartis : {Number(financeSummary.deliveryFeesDistributed||0).toLocaleString('fr-FR')} FCFA · Solde livraison : {Number(financeSummary.deliveryClearingBalance||0).toLocaleString('fr-FR')} FCFA.</small><small>Ventes de plats reçues : {Number(financeSummary.foodSalesCollected||0).toLocaleString('fr-FR')} FCFA · Réparties : {Number(financeSummary.foodSalesDistributed||0).toLocaleString('fr-FR')} FCFA · Solde plats : {Number(financeSummary.foodSalesClearingBalance||0).toLocaleString('fr-FR')} FCFA.</small><small>Ces montants représentent les écritures présentes dans le journal, et non des soldes bancaires ou des reversements confirmés.</small></section>}
 {tabVisible('finance')&&<>{['admin','finance'].includes(user.role)&&<section className="panel"><div className="pagehead"><h2>Journal financier récent</h2><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Actualiser</button></div>{ledger.length?(showAllFinanceJournal?ledger:ledger.slice(0,2)).map(entry=>{const eligibleMasters=accounts.filter(a=>a.role==='master'&&a.status==='active'&&(a.city===entry.beneficiaryCity||(a.masterCities||[]).includes(entry.beneficiaryCity)));return <div className="order-row" key={entry._id}><div><b>{entry.description||entry.kind}</b><small>{entry.accountType} · {entry.kind} · {entry.status==='pending'?'En attente d’affectation':entry.status||'Disponible'}{entry.beneficiaryCity?` · ${entry.beneficiaryCity}`:''} · {entry.createdAt?new Date(entry.createdAt).toLocaleString('fr-FR'):''}</small>{entry.accountType==='master'&&entry.status==='pending'&&<div className="actions"><select aria-label="Master bénéficiaire" value={masterShareChoices[entry._id]||''} onChange={e=>setMasterShareChoices(v=>({...v,[entry._id]:e.target.value}))}><option value="">Choisir le Master de {entry.beneficiaryCity||'cette ville'}</option>{eligibleMasters.map(m=><option key={m._id} value={m._id}>{m.name} · {(m.masterCities?.length?m.masterCities:[m.city]).join(', ')}</option>)}</select><button className="secondary" disabled={!!busy||!masterShareChoices[entry._id]} onClick={()=>assignMasterShare(entry._id)}>Affecter les 3 %</button></div>}</div><b>{entry.direction==='debit'?'-':'+'}{Number(entry.amount||0).toLocaleString('fr-FR')} FCFA</b></div>}) :<p className="muted">Aucune écriture financière enregistrée.</p>}{ledger.length>2&&<button className="secondary" onClick={()=>setShowAllFinanceJournal(v=>!v)}>{showAllFinanceJournal?'Afficher moins':'Voir plus'} <ChevronRight size={15}/></button>}</section>}</>}

 
 {user.role==='admin'&&tabVisible('finance')&&<section className="panel"><div className="pagehead"><div><h2>Demandes de reversement</h2><p>Validation nationale puis exécution par FeexPay. Une demande remplacée par une nouvelle tentative disparaît de cette liste opérationnelle ; son historique reste conservé.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Actualiser</button></div>{payoutRows.length?payoutRows.map(x=><div className="order-row" key={x._id}><div><b>{x.beneficiary?.name||'Bénéficiaire'} · {Number(x.amount).toLocaleString('fr-FR')} FCFA</b><small>{x.accountType} · {x.beneficiary?.city||x.restaurant?.city||''} · {x.network} · {x.phoneNumber}</small><small>Statut : {x.status}{x.providerReference?` · Réf. FeexPay : ${x.providerReference}`:''}</small></div><div className="actions">{x.status==='requested'&&<><button className="primary" disabled={!!busy} onClick={()=>reviewPayout(x._id,'approve')}>Valider et payer</button><button className="secondary" disabled={!!busy} onClick={()=>reviewPayout(x._id,'reject')}>Refuser</button></>}{['processing','approved'].includes(x.status)&&<button className="secondary" disabled={!!busy} onClick={()=>checkPayoutStatus(x._id)}>Vérifier FeexPay</button>}{['processing','approved'].includes(x.status)&&!x.providerReference&&<button className="secondary" disabled={!!busy} onClick={()=>cancelUnreferencedPayout(x._id)}>Annuler après vérification FeexPay</button>}{x.status==='cancelled'&&!x.providerReference&&<button className="primary" disabled={!!busy} onClick={()=>retryPayout(x._id)}>Créer une nouvelle tentative</button>}</div></div>):<p className="muted">Aucune demande de reversement.</p>}</section>}

 {tabVisible('approvals')&&<>{user.role==='admin'&&<section className="panel"><h2>Validations en attente</h2><h3>Modifications des zones de livraison proposées par les restaurants</h3>{deliveryZoneRequests.length?deliveryZoneRequests.map(shop=>(shop.deliveryZoneRequests||[]).map(request=><div className="order-row" key={`${shop._id}-${request._id}`}><div><b>{shop.name} · {shop.city}</b><small>Zones proposées : {(request.zones||[]).join(', ')}</small><small>Zones actuelles : {(shop.deliveryZones||[]).join(', ')}</small></div><div className="actions"><button className="primary" disabled={!!busy} onClick={()=>reviewZoneRequest(shop._id,request._id,'approve')}>Valider les zones</button><button className="secondary" disabled={!!busy} onClick={()=>reviewZoneRequest(shop._id,request._id,'reject')}>Refuser</button></div></div>)): <p className="muted">Aucune demande de modification de zones.</p>}<h3>Tarifs de livraison proposés par les restaurants</h3>{deliveryFeeRequests.length?deliveryFeeRequests.map(shop=>(shop.deliveryZoneFees||[]).map(row=><div className="order-row" key={`${shop._id}-${row.zone}`}><div><b>{shop.name} · {row.zone}</b><small>{shop.city} · Tarif proposé : {Number(row.fee).toLocaleString('fr-FR')} FCFA</small></div><div className="actions"><button className="primary" disabled={!!busy} onClick={()=>decision(`/catalog/admin/delivery-fee-requests/${shop._id}/${encodeURIComponent(row.zone)}`,{decision:'approve'})}>Valider le tarif</button><button className="secondary" disabled={!!busy} onClick={()=>decision(`/catalog/admin/delivery-fee-requests/${shop._id}/${encodeURIComponent(row.zone)}`,{decision:'reject',note:'Proposition refusée par DUNU'})}>Refuser</button></div></div>)): <p className="muted">Aucune proposition tarifaire en attente.</p>}<h3>Restaurants</h3>{pending.restaurants.length?pending.restaurants.map(x=><div className="order-row" key={x._id}><div><b>{x.name}</b><small>{x.city} · {x.address} · {x.owner?.name||''}</small><label>Commune du restaurant<select value={x.city||'Cotonou'} onChange={e=>setPending(v=>({...v,restaurants:v.restaurants.map(r=>r._id===x._id?{...r,city:e.target.value}:r)}))}>{allCommunes.map(c=><option key={c.name} value={c.name}>{c.name} — {c.department}</option>)}</select></label><label>Zones proposées par le restaurant<textarea rows={3} value={(x.deliveryZones||[]).join(', ')} onChange={e=>setPending(v=>({...v,restaurants:v.restaurants.map(r=>r._id===x._id?{...r,deliveryZones:e.target.value.split(/[\n,;]+/).map(z=>z.trim()).filter(Boolean)}:r)}))}/><small>Vérifiez les quartiers déclarés. À la validation, ces zones seront ajoutées automatiquement à la couverture de la commune.</small></label></div><button className="primary" disabled={!!busy||!(x.deliveryZones||[]).length} onClick={()=>decision(`/operations/restaurants/${x._id}/decision`,{approved:true,city:x.city||'Cotonou',deliveryZones:x.deliveryZones||[]})}>Confirmer et activer les zones</button><button className="secondary" disabled={!!busy} onClick={()=>decision(`/operations/restaurants/${x._id}/decision`,{approved:false,city:x.city||'Cotonou'})}>Refuser</button></div>):<p className="muted">Aucun restaurant en attente.</p>}<h3>Comptes</h3>{pending.users.length?pending.users.map(x=>{const assignment=pendingAssignments[x._id]||{};return <div className="order-row" key={x._id}><div><b>{x.name}</b><small>{x.email||x.phone} · Ville déclarée : {x.city||'Non renseignée'}</small><label>Rôle à attribuer<select value={assignment.role||x.role} onChange={e=>updatePendingAssignment(x._id,{role:e.target.value})}><option value="client">Client</option><option value="restaurant">Restaurant</option><option value="rider">Livreur</option></select></label><label>Commune<select value={assignment.city||(cities.some(c=>c.name===x.city)?x.city:'Cotonou')} onChange={e=>updatePendingAssignment(x._id,{city:e.target.value})}>{cities.map(c=><option key={c._id||c.name} value={c.name}>{c.name}</option>)}</select></label></div><button className="primary" disabled={!!busy} onClick={()=>approvePendingUser(x)}>Valider et affecter</button></div>}):<p className="muted">Aucun compte en attente.</p>}</section>}</>}

 {tabVisible('users')&&<>{user.role==='admin'&&<section className="panel"><h2>Gestion nationale des utilisateurs</h2><p>Gérez les comptes nationaux. La suppression définitive efface aussi les commandes, paiements, écritures et autres données associées à ce compte.</p>{accounts.filter(x=>x.role!=='admin').map(x=><div className="order-row" key={x._id}><div><b>{x.name}</b><small>{x.role} · {x.city} · {x.email||x.phone} · {x.status}</small></div><div className="actions"><button className="secondary" disabled={!!busy} onClick={()=>decision(`/operations/users/${x._id}/status`,{status:x.status==='active'?'suspended':'active'})}>{x.status==='active'?'Suspendre':'Réactiver'}</button><button className="secondary" disabled={!!busy} onClick={async()=>{if(!confirm(`SUPPRESSION DÉFINITIVE

Supprimer ${x.name} (${x.role}) et toutes ses données liées : restaurants, menus, commandes, paiements, écritures, messages et notifications ?

Cette opération est irréversible.`))return;setBusy(x._id);try{await api(`/operations/users/${x._id}`,{method:'DELETE'});await refresh()}catch(e){setErr(e.message)}finally{setBusy('')}}}>Supprimer</button></div></div>)}{!accounts.length&&<p className="muted">Aucun utilisateur enregistré.</p>}</section>}</>}

 {tabVisible('riders')&&<>{['admin','master'].includes(user.role)&&<section className="panel"><h2>Localisation des livreurs</h2><p>Dernières positions reçues pendant une livraison active. Les positions ne sont pas suivies en permanence hors livraison.</p>{riderPositions.length?riderPositions.map(r=><div className="order-row rider-location-row" key={r._id}><div><b>{r.name}</b><small>{r.city} · {r.isOnline?'En ligne':'Hors ligne'} · {r.lastLocation?.at?new Date(r.lastLocation.at).toLocaleString('fr-FR'):'Position inconnue'}</small></div>{r.lastLocation?.lat!=null&&r.lastLocation?.lng!=null?<iframe title={`Position de ${r.name}`} className="rider-location-embed" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(r.lastLocation.lng)-0.006}%2C${Number(r.lastLocation.lat)-0.004}%2C${Number(r.lastLocation.lng)+0.006}%2C${Number(r.lastLocation.lat)+0.004}&layer=mapnik&marker=${Number(r.lastLocation.lat)}%2C${Number(r.lastLocation.lng)}`} />:<small className="muted">Position GPS non disponible</small>}</div>):<p className="muted">Aucune position récente. Le livreur doit être affecté à une commande en cours et autoriser le GPS.</p>}</section>}</>}

 {tabVisible('staff')&&<>{user.role==='admin'&&<section className="panel"><h2>Administration nationale — gestion des accès</h2><p>Créez les comptes des responsables Finance et des Masters de ville. Ces comptes ne passent pas par l'inscription publique.</p>{staffSuccess&&<p className="success">{staffSuccess}</p>}<form className="dish-form" onSubmit={createStaff}><label>Nom complet<input required minLength="2" value={staffForm.name} onChange={e=>setStaffForm(v=>({...v,name:e.target.value}))}/></label><label>E-mail professionnel<input required type="email" value={staffForm.email} onChange={e=>setStaffForm(v=>({...v,email:e.target.value}))}/></label><label>Téléphone<input required value={staffForm.phone} onChange={e=>setStaffForm(v=>({...v,phone:e.target.value}))}/></label><label>Rôle<select value={staffForm.role} onChange={e=>setStaffForm(v=>({...v,role:e.target.value}))}><option value="finance">Responsable Finance</option><option value="master">Master de ville</option></select></label>{staffForm.role==='master'&&<div className="field-group"><b>Villes confiées au MASTER (10 maximum)</b><details className="zone-picker"><summary>{(staffForm.cities||[]).length?`${staffForm.cities.length} ville(s) sélectionnée(s)`:'Choisir les villes du Master'}</summary><div className="zone-picker-list">{allCommunes.map(c=><label key={c.name}><input type="checkbox" checked={(staffForm.cities||[]).includes(c.name)} disabled={!(staffForm.cities||[]).includes(c.name)&&(staffForm.cities||[]).length>=10} onChange={e=>setStaffForm(v=>({...v,cities:e.target.checked?[...(v.cities||[]),c.name]:(v.cities||[]).filter(x=>x!==c.name)}))}/>{c.name} — {c.department}</label>)}</div><button type="button" className="secondary" onClick={e=>{e.currentTarget.closest('details').open=false}}>Fermer la liste</button></details><small>Le Master ne verra que les territoires sélectionnés. Sélectionnez au maximum 10 communes.</small></div>}<label>Mot de passe provisoire (10 caractères minimum)<input required minLength="10" type="password" value={staffForm.password} onChange={e=>setStaffForm(v=>({...v,password:e.target.value}))}/></label><button className="primary" disabled={busy==='staff'}>{busy==='staff'?'Création…':'Créer le compte'}</button></form><h3>Comptes de direction</h3>{staff.length?staff.map(x=><div className="order-row" key={x._id}><div><b>{x.name}</b><small>{x.email||x.phone} · {x.role==='admin'?'Administration nationale':x.role==='master'?`Master · ${(x.masterCities?.length?x.masterCities:[x.city]).join(', ')}`:'Finance'} · {x.status}</small>{x.role==='master'&&<div className="field-group"><b>Territoires attribués</b><details className="zone-picker"><summary>{(masterEditSelections[x._id]||x.masterCities?.length?masterEditSelections[x._id]||x.masterCities:[x.city]).length} commune(s) · modifier</summary><div className="zone-picker-list">{allCommunes.map(c=>{const selected=masterEditSelections[x._id]||((x.masterCities?.length?x.masterCities:[x.city]));return <label key={c.name}><input type="checkbox" checked={selected.includes(c.name)} disabled={!selected.includes(c.name)&&selected.length>=10} onChange={e=>setMasterEditSelections(v=>({...v,[x._id]:e.target.checked?[...selected,c.name]:selected.filter(n=>n!==c.name)}))}/>{c.name}</label>})}</div></details><button type="button" className="secondary" disabled={!!busy||!(masterEditSelections[x._id]||x.masterCities||[x.city]).length} onClick={async()=>{const selected=masterEditSelections[x._id]||x.masterCities||[x.city];if(!selected.length||selected.length>10){setErr('Sélectionnez entre 1 et 10 villes.');return;}try{await api(`/operations/users/${x._id}/master-cities`,{method:'PATCH',body:JSON.stringify({cities:selected})});setMasterEditSelections(v=>({...v,[x._id]:undefined}));await refresh();setStaffSuccess('Territoires du Master mis à jour.')}catch(error){setErr(error.message)}}}>Enregistrer les territoires</button></div>}</div></div>):<p className="muted">Aucun compte professionnel supplémentaire.</p>}<small>Pour la sécurité, transmettez le mot de passe provisoire par un canal privé. La fonction de changement de mot de passe sera à ajouter avant l'ouverture générale.</small></section>}</>}

 {user.role==='rider'&&tabVisible('missions')&&<section className="panel"><h2>Disponibilité livreur</h2><p>{gpsStatus}</p><p>Activez votre disponibilité pour recevoir des propositions de livraison.</p><button className={data?.isOnline?'primary':'secondary'} onClick={toggleOnline}>{data?.isOnline?'Passer hors ligne':'Passer en ligne'}</button><h3>Missions disponibles dans votre ville</h3>{riderMissions.length?riderMissions.map(m=><div className="order-card" key={m._id}><div className="order-row"><div><b>{m.code}</b><small>{m.restaurant?.name} · {m.restaurant?.address||m.restaurant?.city}</small></div><span className="status">Prête</span></div><p>{m.deliveryAddress} · {m.deliveryCity||m.restaurant?.city}</p><b>Frais de livraison : {Number(m.riderFee||0).toLocaleString('fr-FR')} FCFA</b><button className="primary" disabled={!data?.isOnline||busy===m._id} onClick={()=>acceptMission(m._id)}>{busy===m._id?'Attribution…':'Accepter cette mission'}</button></div>):<p className="muted">Aucune mission prête et disponible dans votre ville pour le moment.</p>}</section>}

 {user.role==='rider'&&tabVisible('finance')&&riderEarnings&&<section className="panel rider-earnings-panel"><h2>Mes missions et mes gains</h2><div className="stats"><article><Bike/><small>Livraisons terminées</small><b>{riderEarnings.completedDeliveries}</b></article><article><Wallet/><small>Gains estimés des livraisons</small><b>{Number(riderEarnings.estimatedFromDeliveries||0).toLocaleString('fr-FR')} FCFA</b></article><article><Wallet/><small>Gains inscrits au journal</small><b>{Number(riderEarnings.recordedInLedger||0).toLocaleString('fr-FR')} FCFA</b></article></div><p className="muted">Les gains estimés sont calculés à partir des frais de livraison des commandes terminées. Seul le journal financier confirme les montants comptabilisés et payables.</p><h3>Dernières livraisons terminées</h3>{riderEarnings.completedOrders?.slice(0,10).map(o=><div className="order-row" key={o._id}><div><b>{o.code}</b><small>{o.deliveredAt?new Date(o.deliveredAt).toLocaleString('fr-FR'):'Livraison terminée'}</small></div><b>{Number(o.riderFee||0).toLocaleString('fr-FR')} FCFA</b></div>)}</section>}


 {user.role==='restaurant'&&tabVisible('shop')&&shop?.restaurant?.approved&&<section className="panel"><h2>Tarifs de livraison par zone</h2><p>Proposez un tarif fixe pour chacune de vos zones. Le tarif ne sera appliqué aux clients qu’après validation par l’administration nationale DUNU.</p>{(shop.restaurant.deliveryZones||[]).map(zone=>{const rate=(shop.restaurant.deliveryZoneFees||[]).find(x=>x.zone===zone&&x.status==='pending')||(shop.restaurant.deliveryZoneFees||[]).find(x=>x.zone===zone&&x.status==='approved')||(shop.restaurant.deliveryZoneFees||[]).find(x=>x.zone===zone);return <div className="order-row" key={zone}><div><b>{zone}</b><small>{rate?`${Number(rate.fee).toLocaleString('fr-FR')} FCFA · ${rate.status==='approved'?'Tarif actif':rate.status==='pending'?'Validation DUNU en attente':'Proposition refusée'}`:'Tarif DUNU actuel appliqué jusqu’à validation de votre proposition'}</small></div><button className="secondary" onClick={async()=>{const value=prompt(`Tarif fixe de livraison pour ${zone} (FCFA)`,String(rate?.fee??700));if(value===null)return;const fee=Number(value);if(!Number.isSafeInteger(fee)||fee<0||fee>100000){setErr('Tarif invalide. Saisissez un montant entier entre 0 et 100 000 FCFA.');return}try{await api('/catalog/restaurant/me/delivery-fees',{method:'PUT',body:JSON.stringify({fees:[{zone,fee}]})});await refresh();setStaffSuccess(`Proposition envoyée à DUNU : ${zone} · ${fee.toLocaleString('fr-FR')} FCFA.`)}catch(e){setErr(e.message)}}}>Proposer un tarif</button></div>})}</section>}
 {user.role==='restaurant'&&tabVisible('riders')&&shop?.restaurant?.approved&&<section className="panel"><h2>Mes livreurs</h2><p>Ajoutez un livreur DUNU déjà inscrit en indiquant son numéro de téléphone. Il doit être actif et dans la même ville que votre restaurant.</p><form className="dish-form" onSubmit={addRestaurantRider}><label>Téléphone du livreur<input required value={riderPhone} onChange={e=>setRiderPhone(e.target.value)} placeholder="+229..."/></label><button className="primary" disabled={busy==='restaurant-rider'}>Ajouter à mon équipe</button></form>{restaurantRiders.map(r=><div className="order-row" key={r._id}><div><b>{r.name}</b><small>{r.phone} · {r.isOnline?'En ligne':'Hors ligne'}</small></div><button className="secondary" onClick={()=>removeRestaurantRider(r._id)}>Retirer</button></div>)}{!restaurantRiders.length&&<p className="muted">Aucun livreur rattaché à votre restaurant.</p>}</section>}
 {tabVisible('restaurants')&&user.role==='admin'&&<section className="panel"><div className="pagehead"><div><h2>Gestion nationale des menus</h2><p>Sélectionnez un établissement pour consulter, ajouter, modifier ou retirer ses plats.</p></div></div><label>Restaurant<select value={selectedAdminRestaurant} onChange={e=>loadAdminMenu(e.target.value)}><option value="">Choisir un restaurant</option>{financeRestaurants.map(r=><option key={r._id} value={r._id}>{r.name} · {r.city}</option>)}</select></label>{selectedAdminRestaurant&&<><div className="panel-subsection"><h3>Zones d’intervention du restaurant</h3><p>Modifiez les zones réellement desservies. Cette modification administrative est appliquée immédiatement.</p><label>Zones (séparées par des virgules)<textarea key={selectedAdminRestaurant} id="admin-restaurant-zones" rows={3} defaultValue={(financeRestaurants.find(r=>r._id===selectedAdminRestaurant)?.deliveryZones||[]).join(', ')}/></label><button type="button" className="secondary" onClick={async()=>{const field=document.getElementById('admin-restaurant-zones');const zones=[...new Set(String(field?.value||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];if(!zones.length){setErr('Le restaurant doit conserver au moins une zone.');return;}try{await api(`/catalog/admin/restaurants/${selectedAdminRestaurant}`,{method:'PATCH',body:JSON.stringify({deliveryZones:zones})});await refresh();setStaffSuccess('Zones du restaurant mises à jour.')}catch(e){setErr(e.message)}}}>Enregistrer les zones du restaurant</button></div><form className="dish-form" onSubmit={createAdminDish}><h3>Ajouter un plat au restaurant sélectionné</h3>{[['name','Nom du plat'],['description','Description'],['price','Prix FCFA'],['category','Catégorie']].map(([k,l])=><label key={k}>{l}<input required={k==='name'||k==='price'} type={k==='price'?'number':'text'} value={adminDish[k]} onChange={e=>setAdminDish(v=>({...v,[k]:e.target.value}))}/></label>)}<label>URL HTTPS de la photo du plat<input value={adminDish.imageUrl} onChange={e=>setAdminDish(v=>({...v,imageUrl:e.target.value}))} placeholder="https://..."/></label><label>Options (une ligne par groupe)<textarea rows={3} value={adminDish.optionsText} onChange={e=>setAdminDish(v=>({...v,optionsText:e.target.value}))} placeholder="Piment (obligatoire): Doux=0, Fort=100"/></label><button className="primary" disabled={busy==='admin-dish'}>Ajouter le plat</button></form><h3>Menu actuel ({adminMenu.length})</h3>{adminMenu.map(m=><div className="order-row" key={m._id}><div><b>{m.name}</b><small>{Number(m.price).toLocaleString('fr-FR')} FCFA · {m.available?'Disponible':'Indisponible'} · {(m.options||[]).length} groupes d'options</small></div><div className="actions"><button className="secondary" onClick={async()=>{const name=prompt('Nom du plat',m.name);if(name===null)return;const price=Number(prompt('Prix en FCFA',String(m.price)));if(!name.trim()||!Number.isSafeInteger(price)||price<1){setErr('Nom ou prix invalide.');return}try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({name,price})});await loadAdminMenu(selectedAdminRestaurant)}catch(e){setErr(e.message)}}}>Modifier</button><button className="secondary" onClick={async()=>{const current=(m.options||[]).map(g=>`${g.name}${g.required?' (obligatoire)':''}: ${g.choices.map(c=>`${c.name}=${c.price||0}`).join(', ')}`).join('\n');const value=prompt('Options : une ligne par groupe, format Groupe: Choix=prix, Choix=prix',current);if(value===null)return;const options=parseDishOptions(value);if(value.trim()&&!options.length){setErr('Format des options invalide.');return}try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({options})});await loadAdminMenu(selectedAdminRestaurant)}catch(e){setErr(e.message)}}}>Modifier options</button><button className="secondary" onClick={async()=>{try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({available:!m.available})});await loadAdminMenu(selectedAdminRestaurant)}catch(e){setErr(e.message)}}}>{m.available?'Masquer':'Publier'}</button><button className="secondary" onClick={async()=>{if(!confirm('Supprimer ce plat ?'))return;try{await api(`/catalog/menu/${m._id}`,{method:'DELETE'});await loadAdminMenu(selectedAdminRestaurant)}catch(e){setErr(e.message)}}}>Supprimer</button></div></div>)}</>}</section>}
 {user.role==='restaurant'&&tabVisible('overview')&&<section className="panel"><h2>Vue générale de votre restaurant</h2><div className="stats"><article><small>Commandes actives</small><b>{activeOrderCount}</b></article><article><small>Livrées</small><b>{deliveredOrderCount}</b></article><article><small>État de la boutique</small><b>{shop?.restaurant?.approved?'Validée':'À valider'}</b></article><article><small>Notifications non lues</small><b>{notifications.filter(n=>!n.readAt).length}</b></article></div><p>Utilisez les rubriques ci-dessus pour gérer votre activité.</p></section>}
 {user.role==='restaurant'&&tabVisible('shop')&&<section className="panel"><h2>Ma boutique</h2>{!shop?.restaurant?<form onSubmit={createShop}><p>Soumettez votre restaurant à la validation DUNU.</p>{[['name','Nom du restaurant'],['description','Description'],['phone','Téléphone'],['address','Adresse précise du restaurant']].map(([k,l])=><label key={k}>{l}<input required={k==='name'||k==='phone'||k==='address'} value={shopForm[k]} onChange={e=>setShopForm(v=>({...v,[k]:e.target.value}))}/></label>)}<label>Commune du restaurant<select required value={shopForm.city} onChange={e=>setShopForm(v=>({...v,city:e.target.value}))}>{allCommunes.map(c=><option key={c.name} value={c.name}>{c.name} — {c.department}</option>)}</select></label><label>Zones et quartiers desservis par votre restaurant<textarea required rows={4} value={shopForm.deliveryZonesText} onChange={e=>setShopForm(v=>({...v,deliveryZonesText:e.target.value}))} placeholder={'Exemples : Akpakpa, Ganhi, Cadjèhoun, Fidjrossè\nUne zone par ligne ou séparée par des virgules.'}/><small>Indiquez uniquement les quartiers où vous pouvez réellement livrer. DUNU vérifiera et activera ces zones après validation.</small></label><div className="restaurant-location-capture"><button type="button" className="secondary" onClick={captureShopLocation} disabled={busy==='shop-gps'}><LocateFixed size={16}/>{busy==='shop-gps'?'Localisation…':'Enregistrer la position GPS du restaurant'}</button><small>{shopForm.location?'Position GPS enregistrée : elle aidera les clients à trouver ce restaurant à proximité.':'Recommandé : permet aux clients proches de découvrir votre établissement.'}</small></div><button className="primary" disabled={busy==='shop'}>Envoyer la demande</button></form>:<><p><b>{shop.restaurant.name}</b> · {shop.restaurant.approved?'Boutique validée':'En attente de validation'}</p>{shop.restaurant.approved&&<><section className="panel-subsection"><h3>Mes zones de livraison</h3><p>Zones actuellement actives : {(shop.restaurant.deliveryZones||[]).join(', ')}</p>{(shop.restaurant.deliveryZoneRequests||[]).filter(x=>x.status==='pending').length>0&&<p className="notice">Une demande de modification de zones est en attente de validation DUNU. Vos zones actuelles restent actives.</p>}<form className="dish-form" onSubmit={proposeShopZones}><label>Proposer une nouvelle couverture (ajouter ou retirer des zones)<textarea rows={3} required value={shopZoneProposal} onChange={e=>setShopZoneProposal(e.target.value)} placeholder="Ex. Fidjrossè, Cadjèhoun, Akpakpa"/><small>Indiquez la liste complète des zones souhaitées. Les changements ne seront actifs qu’après validation de DUNU.</small></label><button className="secondary" disabled={busy==='shop-zones'}>{busy==='shop-zones'?'Envoi…':'Soumettre les zones à DUNU'}</button></form></section><h3>Ajouter un plat</h3><form className="dish-form" onSubmit={createDish}>{[['name','Nom du plat'],['description','Description'],['price','Prix FCFA'],['category','Catégorie'],['stock','Stock (facultatif)']].map(([k,l])=><label key={k}>{l}<input required={k==='name'||k==='price'} type={k==='price'||k==='stock'?'number':'text'} min={k==='price'||k==='stock'?'0':undefined} value={dish[k]} onChange={e=>setDish(v=>({...v,[k]:e.target.value}))}/></label>)}<label>Options et personnalisations (une ligne par groupe)<textarea rows={3} value={dish.optionsText} onChange={e=>setDish(v=>({...v,optionsText:e.target.value}))} placeholder={'Piment (obligatoire): Doux=0, Moyen=0, Fort=100\nSauce: Arachide=0, Tomate=0\nAccompagnement: Alloco=500, Riz=300'}/><small>Format : Groupe (obligatoire): Choix=prix, Choix=prix. Les prix sont en FCFA.</small></label><label>Photo du plat (JPG, PNG, WebP ou AVIF · optimisation automatique)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={mediaBusy} onChange={e=>{uploadDishImage(e.target.files?.[0]);e.target.value=""}}/></label>{dishImage&&<div className="dish-image-preview"><img src={dishImage} alt="Aperçu optimisé du plat"/><button type="button" className="secondary" onClick={()=>{setDishImage(null);setDish(v=>({...v,imageUrls:[]}))}}>Retirer la photo</button></div>}<label>Courte vidéo du plat (MP4, WebM ou MOV · 50 Mo · 90 secondes maximum)<input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={mediaBusy} onChange={e=>{uploadDishVideo(e.target.files?.[0]);e.target.value=""}}/></label>{dishVideo&&<div className="dish-video-preview"><video src={dishVideo} controls preload="metadata"/><button type="button" className="secondary" onClick={()=>{setDishVideo(null);setDish(v=>({...v,videoUrls:[]}))}}>Retirer la vidéo</button></div>}{mediaBusy&&<p className="muted" role="status">{mediaProgress||"Optimisation du média…"}</p>}<button className="primary" disabled={busy==='dish'||mediaBusy}>Ajouter au menu</button></form><h3>Menu actuel</h3>{shop.menu?.map(m=><div className="order-row" key={m._id}><div><b>{m.name}</b><small>{Number(m.price).toLocaleString('fr-FR')} FCFA · {m.available?'Disponible':'Indisponible'}</small></div><button className="secondary" onClick={async()=>{const value=prompt('Nouveau prix en FCFA',String(m.price));if(value===null)return;const price=Number(value);if(!Number.isSafeInteger(price)||price<1){setErr('Prix invalide : indiquez un montant entier positif.');return}try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({price})});await refresh()}catch(e){setErr(e.message)}}}>Modifier prix</button><button className="secondary" onClick={async()=>{const current=(m.options||[]).map(g=>`${g.name}${g.required?' (obligatoire)':''}: ${g.choices.map(c=>`${c.name}=${c.price||0}`).join(', ')}`).join('\n');const value=prompt('Personnalisations : Groupe: Choix=prix, Choix=prix',current);if(value===null)return;const options=parseDishOptions(value);if(value.trim()&&!options.length){setErr('Format des options invalide.');return}try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({options})});await refresh()}catch(e){setErr(e.message)}}}>Options</button><button className="secondary" onClick={async()=>{const url=prompt('URL HTTPS de la photo (laisser vide pour retirer)',m.imageUrls?.[0]||'');if(url===null)return;if(url&&!/^https:\/\//i.test(url)){setErr('La photo doit avoir une URL HTTPS.');return}try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({imageUrls:url?[url]:[]})});await refresh()}catch(e){setErr(e.message)}}}>Photo</button><button className="secondary" onClick={async()=>{const stockText=prompt('Stock disponible (laisser vide pour stock non suivi)',m.stock??'');if(stockText===null)return;const patch=stockText.trim()===''?{}:{stock:Number(stockText)};if(stockText.trim()!==''&&(!Number.isInteger(patch.stock)||patch.stock<0)){setErr('Stock invalide.');return}const category=prompt('Catégorie du plat',m.category||'');if(category===null)return;try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({...patch,category})});await refresh()}catch(e){setErr(e.message)}}}>Modifier stock/catégorie</button><button className="secondary" onClick={async()=>{try{await api(`/catalog/menu/${m._id}`,{method:'PATCH',body:JSON.stringify({available:!m.available})});await refresh()}catch(e){setErr(e.message)}}}>{m.available?'Désactiver':'Activer'}</button><button className="secondary" onClick={async()=>{if(!confirm('Supprimer ce plat du menu ?'))return;try{await api(`/catalog/menu/${m._id}`,{method:'DELETE'});await refresh()}catch(e){setErr(e.message)}}}>Supprimer</button></div>)}</>}</>}</section>}

 {tabVisible('overview')&&user.role==='master'&&<section className="panel"><h2>Supervision opérationnelle · {(opsSummary?.cities||user.masterCities||[user.city]).join(', ')}</h2><p>Vue limitée aux restaurants, commandes, livreurs et actions des villes qui vous sont attribuées.</p><h3>Restaurants des villes attribuées</h3>{financeRestaurants.filter(r=>(opsSummary?.cities||user.masterCities||[user.city]).includes(r.city)).map(r=><div className="order-row" key={r._id}><div><b>{r.name}</b><small>{r.approved?'Validé':'En attente'} · {r.active?'Actif':'Inactif'}</small></div><span className="status">{r.city}</span></div>)}<h3>Dernières actions de supervision</h3>{auditRows.slice(0,12).map(row=><div className="order-row" key={row._id}><div><b>{row.action}</b><small>{row.actor?.name||'Équipe DUNU'} · {row.restaurant?.name||row.targetType} · {new Date(row.createdAt).toLocaleString('fr-FR')}</small></div></div>)}{!auditRows.length&&<p className="muted">Aucune action enregistrée pour le moment.</p>}</section>}
 {tabVisible('orders')&&<><section className="panel"><div className="pagehead"><h2>Commandes récentes</h2><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Actualiser</button></div>{activeOrdersForList.length?activeOrdersForList.map(o=>{const unpaidOnline=o.paymentMethod==='mobile_money'&&o.paymentStatus!=='paid';const target=unpaidOnline?undefined:next[user.role]?.[o.status];return <div className="order-card" key={o._id}><div className="order-row"><div><b>{o.code}</b><small>{o.restaurant?.name||'Restaurant'} · {o.customer?.name||'Client'} · {new Date(o.createdAt).toLocaleString('fr-FR')}</small>{['admin','master'].includes(user.role)&&o.customer?.phone&&<small>Contact client : {o.customer.phone} · <a href={`tel:${o.customer.phone}`}>Appeler</a> · <a href={`sms:${o.customer.phone}`}>SMS</a> · <a href={`https://wa.me/${String(o.customer.phone).replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer">WhatsApp</a></small>}</div><span className="status">{unpaidOnline?(o.paymentStatus==='failed'?'Paiement échoué':'En attente de paiement'):o.status}</span></div>{o.paymentMethod==='mobile_money'&&<small>Mobile Money · {o.paymentStatus==='paid'?'Payé':o.paymentStatus==='failed'?'Échec du paiement':'Paiement non confirmé'}</small>}<p>{o.items?.map(i=>`${i.quantity} × ${i.name}`).join(' · ')}</p><b>{Number(o.total||0).toLocaleString('fr-FR')} FCFA</b>{user.role==='client'&&o.deliveryOtpCode&&o.status!=='delivered'&&<p className="otp-customer"><b>Code secret de remise : {o.deliveryOtpCode}</b><small>À communiquer au moment de recevoir votre commande.</small></p>}{['admin','master','restaurant'].includes(user.role)&&o.customer?._id&&<div className="actions"><button type="button" className="secondary" onClick={()=>{setCommunicationRecipient(String(o.customer._id));setAdminTab('messages')}}><MessageCircle size={15}/> Contacter le client dans DUNU</button></div>}{user.role==='admin'&&unpaidOnline&&o.status!=='cancelled'&&<div className="actions"><button className="secondary" disabled={busy===o._id} onClick={()=>changeStatus(o,'cancelled')}>Refuser / annuler la commande</button></div>}{user.role==='admin'&&(o.paymentStatus==='failed'||(o.status==='cancelled'&&o.paymentStatus!=='paid')||(o.paymentMethod==='mobile_money'&&o.paymentStatus==='pending'&&o.status==='placed'))&&<div className="actions"><button className="secondary" disabled={busy==='archive-'+o._id} onClick={()=>archiveFailedOrder(o)}>{busy==='archive-'+o._id?'Archivage…':'Archiver cette commande sans paiement'}</button></div>}{['admin','master'].includes(user.role)&&['ready','picked_up','on_the_way'].includes(o.status)&&!o.hasDeliveryCode&&<div className="actions"><button className="secondary" disabled={busy==='otp-'+o._id} onClick={()=>generateDeliveryCode(o)}>Générer le code de remise et notifier le client</button></div>}{generatedDeliveryCodes[o._id]&&['admin','master'].includes(user.role)&&<p><b>Code envoyé au client : {generatedDeliveryCodes[o._id]}</b> — à lui demander de le communiquer au livreur.</p>}{target&&<div className="actions">{target==='delivered'&&<input aria-label="Code OTP" placeholder="Code OTP client" value={otp[o._id]||''} onChange={e=>setOtp(v=>({...v,[o._id]:e.target.value}))}/>}<button className="primary" disabled={busy===o._id} onClick={()=>changeStatus(o,target)}>{busy===o._id?'Traitement…':({accepted:'Accepter',preparing:'Démarrer préparation',ready:'Commande prête',picked_up:'Repas récupéré',on_the_way:'En route',delivered:'Confirmer livraison'})[target]}</button></div>}{user.role==='restaurant'&&['ready','picked_up'].includes(o.status)&&<div className="actions"><select aria-label="Choisir un livreur" value={orderRiderChoice[o._id]||o.rider?._id||''} onChange={e=>setOrderRiderChoice(v=>({...v,[o._id]:e.target.value}))}><option value="">Choisir un livreur</option>{restaurantRiders.map(r=><option key={r._id} value={r._id}>{r.name} · {r.own?'Mon équipe':'Livreur DUNU'} · {r.isOnline?'En ligne':'Hors ligne'}</option>)}</select><button className="secondary" disabled={!orderRiderChoice[o._id]||busy===o._id} onClick={async()=>{setBusy(o._id);try{await api(`/orders/${o._id}/assign-rider`,{method:'POST',body:JSON.stringify({riderId:orderRiderChoice[o._id]})});await refresh();setOrderRiderChoice(v=>({...v,[o._id]:''}))}catch(e){setErr(e.message)}finally{setBusy('')}}}>Affecter le livreur</button></div>}</div>}) : <p className="muted">Aucune commande active pour le moment.</p>}</section>{deliveredOrdersForList.length>0&&<section className="panel"><h2>Commandes livrées</h2>{deliveredOrdersForList.map(o=><div className="order-row" key={o._id}><div><b>{o.code}</b><small>{o.restaurant?.name||'Restaurant'} · {o.customer?.name||'Client'} · {new Date(o.createdAt).toLocaleString('fr-FR')}</small></div><span className="status">Livrée</span><b>{Number(o.total||0).toLocaleString('fr-FR')} FCFA</b></div>)}</section>}{unsuccessfulOrdersForList.length>0&&<section className="panel"><h2>Commandes annulées, échouées ou non payées</h2><p className="muted">Ces commandes restent séparées des commandes actives et livrées. Leur historique est conservé.</p>{unsuccessfulOrdersForList.map(o=><div className="order-row" key={o._id}><div><b>{o.code}</b><small>{o.restaurant?.name||'Restaurant'} · {o.customer?.name||'Client'} · {new Date(o.createdAt).toLocaleString('fr-FR')}</small><small>{o.paymentStatus==='failed'?'Paiement échoué':o.status==='cancelled'?'Commande annulée':'Paiement en attente'}</small></div><span className="status">{o.status==='cancelled'?'Annulée':o.paymentStatus==='failed'?'Échec':'Non payée'}</span>{user.role==='admin'&&o.paymentStatus!=='paid'&&!o.codCommissionReserved&&<button className="secondary" disabled={busy==='archive-'+o._id} onClick={()=>archiveFailedOrder(o)}>{busy==='archive-'+o._id?'Archivage…':'Archiver'}</button>}</div>)}</section>}</>}
 {user.role==='client'&&tabVisible('overview')&&orders.length>0&&<section className="panel client-recent-order"><div className="pagehead"><h2>Mes commandes récentes</h2><button type="button" className="secondary" onClick={()=>setClientTab('orders')}>Voir plus <ChevronRight size={15}/></button></div>{[...orders].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,1).map(o=><div className="order-row" key={o._id}><div><b>{o.code}</b><small>{o.restaurant?.name||'Restaurant'} · {new Date(o.createdAt).toLocaleDateString('fr-FR')}</small></div><span className="status">{o.status==='delivered'?'Livrée':o.status==='cancelled'?'Annulée':o.status}</span><b>{Number(o.total||0).toLocaleString('fr-FR')} FCFA</b></div>)}</section>}
 {tabVisible('overview')&&<>{events.length>0&&<section className="panel"><h2>Activité récente</h2>{events.map((x,i)=><p key={i}>• {x}</p>)}</section>}</>}
 {tabVisible('overview')&&user.role!=='client'&&<><section className="panel"><h2>Accès rapide</h2><div className="actions"><Link className="secondary" to="/restaurants">Voir les restaurants</Link><Link className="secondary" to="/track">Suivre une commande</Link></div></section></>}
 {user.role==='client'&&<nav className="client-dashboard-bottom" aria-label="Navigation de l'espace client"><button className={clientTab==='overview'?'active':''} onClick={()=>setClientTab('overview')}><House/><span>Accueil</span></button><Link to="/restaurants"><Utensils/><span>Restaurants</span></Link><button className={clientTab==='orders'?'active':''} onClick={()=>setClientTab('orders')}><ShoppingBag/><span>Commandes</span></button><button className={clientTab==='notifications'?'active':''} onClick={()=>{setClientTab('notifications');setShowAllClientNotifications(false)}}><Bell/><span>Notifications</span>{notifications.some(n=>!n.readAt)&&<i>{Math.min(99,notifications.filter(n=>!n.readAt).length)}</i>}</button><button className={clientTab==='messages'?'active':''} onClick={()=>setClientTab('messages')}><CircleUserRound/><span>Mon espace</span></button></nav>}
 </div>
 </div>
 </main>
}

function RestaurantDetail(){
 const {id}=useParams();
 const [restaurant,setRestaurant]=useState(null),[menu,setMenu]=useState([]),[cart,setCart]=useState({}),[customSelections,setCustomSelections]=useState({}),[dishNotes,setDishNotes]=useState({}),[address,setAddress]=useState(''),[method,setMethod]=useState('cash'),[phone,setPhone]=useState(''),[network,setNetwork]=useState('mtn'),[recipientName,setRecipientName]=useState(''),[recipientPhone,setRecipientPhone]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[customerLocation,setCustomerLocation]=useState(null),[gpsMessage,setGpsMessage]=useState(''),[deliveryZone,setDeliveryZone]=useState(''),[cityInfo,setCityInfo]=useState(null),[legalAccepted,setLegalAccepted]=useState(false);
 useEffect(()=>{api(`/catalog/restaurants/${id}/menu`).then(setMenu).catch(e=>setError(e.message));api('/catalog/restaurants').then(rows=>{const found=rows.find(x=>x._id===id)||null;setRestaurant(found);if(found&&!found.cashPaymentEnabled)setMethod('mobile_money');if(found)api('/catalog/cities').then(cs=>setCityInfo(cs.find(c=>c.name===found.city)||null)).catch(()=>{})}).catch(()=>{})},[id]);
 const clientSignedIn=(()=>{try{return Boolean(token()&&JSON.parse(localStorage.getItem('dunu_user')||'null')?.role==='client')}catch{return false}})();
 const restaurantPhone=String(restaurant?.phone||'').trim();
 const restaurantTel=restaurantPhone.replace(/(?!^)\D/g,'');
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 const subtotal=menu.reduce((a,x)=>{const selections=customSelections[x._id]||{};const extra=(x.options||[]).reduce((sum,g)=>{const choice=g.choices?.find(c=>c.name===selections[g.name]);return sum+(choice?.price||0)},0);return a+(cart[x._id]||0)*(x.price+extra)},0);
 const buyerCity=(()=>{try{return JSON.parse(localStorage.getItem('dunu_user')||'{}').city||'Cotonou'}catch{return 'Cotonou'}})();
 const deliveryCity=restaurant?.city||buyerCity;const availableZones=[...new Set((restaurant?.deliveryZones?.length?restaurant.deliveryZones:[...(cityInfo?.neighborhoods||[]),...(cityInfo?.deliveryZones||[]).map(z=>typeof z==='string'?z:z.name)]).filter(Boolean))];
 const isIntercity=Boolean(deliveryCity.trim().toLocaleLowerCase('fr')!==buyerCity.trim().toLocaleLowerCase('fr'));
 const selectedZoneFee=(()=>{if(!deliveryZone)return null;const approved=(restaurant?.deliveryZoneFees||[]).find(row=>row.zone===deliveryZone&&row.status==='approved');if(approved&&Number.isFinite(Number(approved.fee)))return Number(approved.fee);const cityZone=(cityInfo?.deliveryZones||[]).find(z=>(typeof z==='string'?z:z.name)===deliveryZone);if(cityZone&&typeof cityZone==='object'&&Number.isFinite(Number(cityZone.fee)))return Number(cityZone.fee);return null})();
 const estimatedDeliveryFee=selectedZoneFee;
 const paymentBase=estimatedDeliveryFee===null?null:subtotal+estimatedDeliveryFee;
 const paymentFee=paymentBase===null?null:((method==='mobile_money'||isIntercity)?Math.ceil(paymentBase*0.017):0);
 const estimatedTotal=paymentBase===null?null:paymentBase+paymentFee;
 function captureDeliveryGps(){if(!navigator.geolocation){setGpsMessage('GPS non disponible sur cet appareil.');return}if(!window.isSecureContext){setGpsMessage('Le GPS nécessite une connexion HTTPS.');return}setGpsMessage('Recherche de votre position…');navigator.geolocation.getCurrentPosition(pos=>{setCustomerLocation({lat:pos.coords.latitude,lng:pos.coords.longitude});setGpsMessage('Position de livraison enregistrée.')},err=>setGpsMessage(err.code===1?'Accès GPS refusé. Autorisez la localisation dans les réglages du navigateur puis réessayez. Vous pouvez saisir votre adresse manuellement.':err.code===2?'Position introuvable. Activez le GPS du téléphone ou saisissez votre adresse.':'Le GPS met trop de temps à répondre. Réessayez ou saisissez votre adresse.'),{enableHighAccuracy:true,timeout:20000,maximumAge:0})}
 async function checkout(e){e.preventDefault();if(!token()){setError('Connectez-vous pour passer commande.');return}if(!legalAccepted){setError('Veuillez lire et accepter les informations de commande et les conditions avant de continuer.');return}if(estimatedTotal===null){setError('Sélectionnez votre zone de livraison pour afficher le montant exact.');return}setBusy(true);setError('');try{const order=await api('/orders',{method:'POST',body:JSON.stringify({restaurantId:id,items:Object.entries(cart).filter(([,q])=>q>0).map(([menuItem,quantity])=>({menuItem,quantity,customizations:Object.entries(customSelections[menuItem]||{}).filter(([,choice])=>choice).map(([group,choice])=>({group,choice})),customerNote:dishNotes[menuItem]||''})),deliveryAddress:address,deliveryCity,deliveryZone,recipientName,recipientPhone,...(customerLocation?{customerLocation}:{}),paymentMethod:isIntercity?'mobile_money':method})});if(method==='mobile_money'||isIntercity){try{const payment=await api('/payments/feexpay/deposit',{method:'POST',body:JSON.stringify({orderId:order._id,phone,network})});setMessage(`Commande ${order.code} créée. Demande FeexPay ${network.toUpperCase()} : ${payment.status}. Suivez les instructions sur votre téléphone.`)}catch(payError){setMessage(`Commande ${order.code} créée, mais le paiement n'a pas pu être initié : ${payError.message}. Reprenez contact avec DUNU avant de recommencer la commande.`)}}else{setMessage(`Commande ${order.code} créée. Vous pouvez suivre son évolution dans votre espace.`)}setCart({});setCustomSelections({});setDishNotes({})}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <main className="page"><Link to="/restaurants" className="back-link">← Tous les restaurants</Link><span className="eyebrow">MENU DU RESTAURANT</span><h1>{restaurant?.name||'Restaurant'}</h1><p>{restaurant?.city} · {restaurant?.address}</p>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}{clientSignedIn&&<section className="panel restaurant-dunu-call"><h2>Contacter ce restaurant</h2><p>Discutez directement avec l’équipe du restaurant, sans afficher de numéro de téléphone.</p><CallPanel user={JSON.parse(localStorage.getItem('dunu_user')||'{}')} restaurantId={id} listenIncoming={false}/></section>}<div className="menu-grid">{menu.map(x=><article className="menu-item" key={x._id}><div className="foodplaceholder">{x.imageUrls?.[0]?<img src={x.imageUrls[0]} alt={x.name}/>:"🍲"}</div><div>{x.videoUrls?.[0]&&<video className="dish-card-video" src={x.videoUrls[0]} controls preload="none"/>}<h3>{x.name}</h3><p>{x.description}</p><b>{Number(x.price).toLocaleString('fr-FR')} FCFA</b>{(x.options||[]).map(group=><label key={group.name}>{group.name}{group.required?' *':''}<select value={(customSelections[x._id]||{})[group.name]||''} onChange={e=>setCustomSelections(v=>({...v,[x._id]:{...(v[x._id]||{}),[group.name]:e.target.value}}))}><option value="">Choisir</option>{group.choices.map(choice=><option key={choice.name} value={choice.name}>{choice.name}{choice.price?` (+${choice.price} FCFA)`:''}</option>)}</select></label>)}{x.customizationNotes!==false&&<label>Instructions<textarea rows={2} maxLength={300} value={dishNotes[x._id]||''} onChange={e=>setDishNotes(v=>({...v,[x._id]:e.target.value}))} placeholder="Ex. peu salé, sauce à part…"/></label>}<div className="actions"><button className="secondary" onClick={()=>setCart(v=>({...v,[x._id]:Math.max(0,(v[x._id]||0)-1)}))}>−</button><b>{cart[x._id]||0}</b><button className="primary" onClick={()=>setCart(v=>({...v,[x._id]:(v[x._id]||0)+1}))}>+</button></div></div></article>)}</div>{!menu.length&&!error&&<p className="empty">Aucun plat disponible pour le moment.</p>}{count>0&&<form className="panel checkout" onSubmit={checkout}><h2>Votre panier ({count} article(s))</h2><section className="checkout-price-breakdown"><h3>Détail du montant à payer</h3>{menu.filter(x=>(cart[x._id]||0)>0).map(x=>{const selections=customSelections[x._id]||{};const extra=(x.options||[]).reduce((sum,g)=>{const choice=g.choices?.find(c=>c.name===selections[g.name]);return sum+(choice?.price||0)},0);const unit=Number(x.price||0)+extra;return <div key={x._id}><span>{cart[x._id]} × {x.name}{extra>0?` (options +${extra.toLocaleString('fr-FR')} FCFA)`:''}</span><b>{(cart[x._id]*unit).toLocaleString('fr-FR')} FCFA</b></div>})}<div><span>Sous-total des plats</span><b>{subtotal.toLocaleString('fr-FR')} FCFA</b></div><div><span>Frais de livraison {deliveryZone?`· ${deliveryZone}`:''}</span><b>{estimatedDeliveryFee===null?'À calculer après choix de la zone':`${estimatedDeliveryFee.toLocaleString('fr-FR')} FCFA`}</b></div>{(method==='mobile_money'||isIntercity)&&<div><span>Frais de service de paiement FeexPay (1,7 %)</span><b>{paymentFee===null?'—':`${paymentFee.toLocaleString('fr-FR')} FCFA`}</b></div>}<div className="checkout-grand-total"><span>Total {method==='cash'&&!isIntercity?'à régler à la livraison':'à payer par Mobile Money'}</span><b>{estimatedTotal===null?'—':`${estimatedTotal.toLocaleString('fr-FR')} FCFA`}</b></div><small>Les frais FeexPay de 1,7 % sont appliqués uniquement aux paiements Mobile Money, sur le montant des plats et de la livraison. Aucun frais FeexPay n’est ajouté au paiement en espèces à la livraison.</small></section><section className="checkout-delivery-fields"><div className="checkout-delivery-heading"><b>Lieu de livraison</b><button type="button" className="secondary checkout-gps-button" onClick={captureDeliveryGps}><MapPin size={14}/> Me localiser</button></div><div className="checkout-delivery-grid"><label>Ville<input required readOnly value={deliveryCity}/></label><label>Quartier / zone<select required={availableZones.length>0} value={deliveryZone} onChange={e=>setDeliveryZone(e.target.value)}><option value="">{availableZones.length?'Choisir une zone':'Préciser dans l’adresse'}</option>{availableZones.map(z=><option key={z} value={z}>{z}</option>)}</select></label><label className="checkout-address-field">Adresse précise<input required minLength="5" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Quartier, rue, repère…"/></label></div>{gpsMessage&&<small className="checkout-gps-message">{gpsMessage}</small>}<small className="checkout-location-hint">Choisissez votre zone et indiquez un repère précis pour faciliter la livraison.</small></section>{isIntercity&&<><p className="notice">Commande à distance : livraison à {deliveryCity}. Paiement en ligne obligatoire.</p><div className="checkout-delivery-grid"><label>Nom du proche destinataire<input required minLength={2} value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Nom et prénom du destinataire"/></label><label>Téléphone du proche<input required value={recipientPhone} onChange={e=>setRecipientPhone(e.target.value)} placeholder="Téléphone du destinataire"/></label></div></>}<label>Mode de paiement<select value={isIntercity?'mobile_money':method} onChange={e=>setMethod(e.target.value)} disabled={isIntercity}><option value="cash" disabled={restaurant?.cashPaymentEnabled===false}>Espèces à la livraison{restaurant?.cashPaymentEnabled===false?' (indisponible — recharge Commission nécessaire)':''}</option><option value="mobile_money">Mobile Money</option></select></label>{(method==='mobile_money'||isIntercity)&&<><label>Téléphone Mobile Money<input required inputMode="numeric" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="22901XXXXXXXX"/></label><label>Opérateur Mobile Money<select required value={network} onChange={e=>setNetwork(e.target.value)}><option value="mtn">MTN Bénin</option><option value="moov">Moov Bénin</option><option value="celtiis">Celtiis Bénin</option></select></label></>}<section className="checkout-legal"><h3>Informations importantes et accord du client</h3><p>En confirmant, vous reconnaissez que le prix des plats, les frais de livraison liés à la zone choisie et, le cas échéant, les frais de service FeexPay sont détaillés ci-dessus. Le montant final affiché avant confirmation est celui de votre commande.</p><p>Pour un paiement Mobile Money, le paiement est traité par FeexPay. La commande n’est considérée comme payée qu’après confirmation effective du prestataire. Une demande initiée ou en attente ne constitue pas une preuve de paiement.</p><p>Vous êtes responsable de l’exactitude du numéro Mobile Money, du nom du destinataire, de l’adresse et de la zone de livraison. Les délais de préparation et de livraison sont indicatifs et peuvent varier selon le restaurant, le livreur, la circulation ou les conditions d’accès. Toute demande de modification ou d’annulation doit être signalée rapidement au support DUNU ; son traitement dépend de l’état de préparation de la commande et des règles applicables.</p><p>DUNU facilite la mise en relation entre le client, le restaurant et le livreur. Les plats sont préparés et fournis par le restaurant partenaire. Le client doit vérifier les informations de sa commande avant de la confirmer.</p><label className="checkout-legal-consent"><input type="checkbox" checked={legalAccepted} onChange={e=>setLegalAccepted(e.target.checked)}/> J’ai lu et j’accepte le détail des prix, les frais applicables et les conditions de commande ci-dessus.</label></section><button className="primary full" disabled={busy||estimatedTotal===null||!legalAccepted}>{busy?'Envoi…':'Confirmer la commande'}</button><small>{isIntercity?'Paiement Mobile Money obligatoire. Le restaurant ne recevra la commande qu’après confirmation réelle du paiement.':'Le paiement Mobile Money est initié après la création de la commande.'}</small></form>}</main>
}

/* APPELS AUDIO UNIQUEMENT */
function CallPanel({user,restaurantId=null,globalListener=false,listenIncoming=true,initialRecipientId=''}){
 const[recipient,setRecipient]=useState(initialRecipientId||'');
 const[contacts,setContacts]=useState([]);
 const[messages,setMessages]=useState([]);
 const[messageBody,setMessageBody]=useState('');
 const[messageFeedback,setMessageFeedback]=useState('');
 const selectedRecipientRef=React.useRef('');
 const[incoming,setIncoming]=useState(null);
 const incomingRef=React.useRef(null);
 const[call,setCall]=useState(null);
 const[status,setStatus]=useState('Aucun appel en cours');
 const[muted,setMuted]=useState(false);
 const[audioNeedsTap,setAudioNeedsTap]=useState(false);

 const socketRef=React.useRef(null);
 const pcRef=React.useRef(null);
 const localRef=React.useRef(null);
 const remoteRef=React.useRef(null);
 const pendingCandidatesRef=React.useRef([]);
 const localCandidatesRef=React.useRef([]);
 const pendingOfferRef=React.useRef(null);
 const peerRef=React.useRef(null);
 const acceptedRef=React.useRef(false);
 const callRef=React.useRef(null);
 const ringContextRef=React.useRef(null);
 const ringTimerRef=React.useRef(null);
 const iceServersRef=React.useRef([{urls:'stun:stun.l.google.com:19302'}]);

 function cleanup(){
  if(pcRef.current){pcRef.current.onicecandidate=null;pcRef.current.ontrack=null;pcRef.current.close();pcRef.current=null}
  if(localRef.current){localRef.current.getTracks().forEach(track=>track.stop());localRef.current=null}
  if(remoteRef.current)remoteRef.current.srcObject=null;
  setAudioNeedsTap(false);
  pendingCandidatesRef.current=[];
  localCandidatesRef.current=[];
  pendingOfferRef.current=null;
  peerRef.current=null;
  acceptedRef.current=false;
  callRef.current=null;
  setCall(null);
  setIncoming(null);
  incomingRef.current=null;
  if(ringTimerRef.current)window.clearInterval(ringTimerRef.current);ringTimerRef.current=null;try{navigator.vibrate?.(0)}catch{}
  setMuted(false);
 }

 async function ensureMicrophone(){
  if(!window.isSecureContext)throw new Error('Le microphone exige une adresse HTTPS. Ouvrez DUNU depuis son adresse sécurisée.');
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Ce navigateur ne donne pas accès au microphone. Essayez Chrome ou Safari à jour.');
  if(localRef.current?.getAudioTracks().some(track=>track.readyState==='live'))return localRef.current;
  try{
   localRef.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   return localRef.current;
  }catch(error){
   if(error.name==='NotAllowedError'||error.name==='PermissionDeniedError')throw new Error('Microphone refusé ou bloqué. Autorisez le microphone pour DUNU dans les réglages du navigateur, puis rechargez la page.');
   if(error.name==='NotFoundError'||error.name==='DevicesNotFoundError')throw new Error('Aucun microphone détecté sur cet appareil.');
   if(error.name==='NotReadableError'||error.name==='TrackStartError')throw new Error('Le microphone est déjà utilisé par une autre application. Fermez-la puis réessayez.');
   throw new Error(`Impossible d’activer le microphone : ${error.message||'vérifiez les permissions du téléphone'}`);
  }
 }

 async function makePeer(otherId,roomId){
  if(pcRef.current)return pcRef.current;
  await ensureMicrophone();
  const pc=new RTCPeerConnection({iceServers:iceServersRef.current});
  pcRef.current=pc;
  peerRef.current={otherId,roomId};

  pc.onicecandidate=e=>{
   if(e.candidate){const candidate=e.candidate.toJSON();localCandidatesRef.current.push(candidate);socketRef.current?.emit('webrtc:signal',{to:otherId,roomId,signal:{candidate}})}
  };
  pc.ontrack=e=>{
   if(remoteRef.current){
    const stream=e.streams?.[0]||new MediaStream([e.track]);
    remoteRef.current.srcObject=stream;
    remoteRef.current.play?.().then(()=>setAudioNeedsTap(false)).catch(()=>setAudioNeedsTap(true));
   }
  };
  pc.onconnectionstatechange=()=>{
   if(pc.connectionState==='connected')setStatus('Appel audio connecté');
   else if(['failed','disconnected'].includes(pc.connectionState))setStatus('Connexion instable. Vérifiez votre réseau et la configuration TURN.');
  };

  const stream=localRef.current;
  stream.getAudioTracks().forEach(track=>pc.addTrack(track,stream));
  return pc;
 }

 async function applyPendingCandidates(){
  if(!pcRef.current?.remoteDescription)return;
  for(const candidate of pendingCandidatesRef.current.splice(0)){
   try{await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){console.warn('ICE candidate ignoré',e)}
  }
 }

 async function answerOffer(message){
  if(!acceptedRef.current||!message?.signal||message.signal.type!=='offer')return;
  try{
   const pc=await makePeer(message.from,message.roomId);
   if(pc.remoteDescription)return;
   await pc.setRemoteDescription(new RTCSessionDescription(message.signal));
   await applyPendingCandidates();
   const answer=await pc.createAnswer();
   await pc.setLocalDescription(answer);
   socketRef.current?.emit('webrtc:signal',{to:message.from,roomId:message.roomId,signal:pc.localDescription});
   setStatus('Appel accepté — connexion audio en cours');
  }catch(e){setStatus(`Erreur de connexion : ${e.message}`)}
 }

 useEffect(()=>{
  selectedRecipientRef.current=recipient;
  if(globalListener||!recipient)return;
  const ids=[String(user.id||user._id),String(recipient)].sort();
  let active=true;
  api(`/communication/messages/${ids.join(':')}${restaurantId?`?restaurantId=${encodeURIComponent(restaurantId)}`:''}`).then(rows=>{if(active)setMessages(rows)}).catch(e=>{if(active)setMessageFeedback(e.message)});
  return()=>{active=false};
 },[recipient,user.id,user._id,globalListener]);

 useEffect(()=>{
  let alive=true;
  if(!token())return()=>{};
  if(!globalListener)api(restaurantId?`/communication/contacts?restaurantId=${encodeURIComponent(restaurantId)}`:'/communication/contacts').then(rows=>{if(alive){setContacts(rows);const preferred=initialRecipientId&&rows.some(x=>String(x.id)===String(initialRecipientId))?String(initialRecipientId):'';if(preferred||rows[0])setRecipient(preferred||rows[0].id)}}).catch(e=>{if(alive)setMessageFeedback(e.message)});

  api('/communication/ice-servers').then(result=>{
   if(alive&&Array.isArray(result.iceServers)&&result.iceServers.length){
    iceServersRef.current=result.iceServers;
   }
  }).catch(e=>console.warn('Configuration ICE indisponible, STUN de secours utilisé.',e));

  const showIncoming=x=>{
   if(!x?.roomId||callRef.current?.roomId===x.roomId||incomingRef.current?.roomId===x.roomId)return;
   incomingRef.current=x;setIncoming(x);setStatus(`Appel audio entrant de ${x.caller?.name||'un utilisateur'}`);
   try{navigator.vibrate?.([350,180,350,180,650])}catch{}
   if(globalListener&&'Notification' in window&&window.Notification.permission==='granted'){
    try{const notice=new window.Notification('Appel audio entrant',{body:`${x.caller?.name||'Un utilisateur'} vous appelle sur DUNU.`,icon:'/dunu-logo.webp',tag:`dunu-call-${x.roomId}`,requireInteraction:true});notice.onclick=()=>{window.focus();notice.close()}}catch{}
   }
  };
  const pollIncoming=()=>{if(globalListener&&listenIncoming)api('/communication/calls/incoming').then(rows=>{if(!alive||!Array.isArray(rows))return;if(rows.length)showIncoming(rows[0]);else if(incomingRef.current){incomingRef.current=null;setIncoming(null)}}).catch(()=>{})};
  const socket=io(import.meta.env.VITE_API_URL||undefined,{auth:{token:token()},reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:5000,timeout:12000});
  socketRef.current=socket;
  socket.on('connect',()=>{
   pollIncoming();
   const peer=peerRef.current,pc=pcRef.current;
   if(peer&&pc?.localDescription){socket.emit('webrtc:signal',{to:peer.otherId,roomId:peer.roomId,signal:pc.localDescription});for(const candidate of localCandidatesRef.current)socket.emit('webrtc:signal',{to:peer.otherId,roomId:peer.roomId,signal:{candidate}})}
  });
  socket.on('connect_error',()=>{if(globalListener)setStatus('Connexion aux appels en cours de rétablissement…')});
  if(globalListener&&listenIncoming){pollIncoming();var incomingPoll=window.setInterval(pollIncoming,2500)}

  if(listenIncoming)socket.on('call:incoming',showIncoming);

  socket.on('message:new',message=>{
   const myId=String(user.id||user._id);
   const otherId=String(selectedRecipientRef.current||'');
   if(otherId&&[String(message.sender),String(message.recipient)].includes(myId)&&[String(message.sender),String(message.recipient)].includes(otherId)){
    setMessages(rows=>rows.some(x=>x._id===message._id)?rows:[...rows,message]);
   }
  });

  socket.on('webrtc:signal',async msg=>{
   if(globalListener&&!callRef.current&&!incomingRef.current)return;
   try{
    if(msg.signal?.type==='offer'){
     pendingOfferRef.current=msg;
     if(acceptedRef.current)await answerOffer(msg);
     else setStatus('Appel entrant — acceptez pour démarrer la conversation');
    }else if(msg.signal?.type==='answer'){
     if(!pcRef.current)return;
     await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.signal));
     await applyPendingCandidates();
     setStatus('Réponse reçue — connexion audio en cours');
    }else if(msg.signal?.candidate){
     if(pcRef.current?.remoteDescription){
      await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
     }else{
      pendingCandidatesRef.current.push(msg.signal.candidate);
     }
    }
   }catch(e){setStatus(`Erreur de connexion : ${e.message}`)}
  });

  socket.on('call:status',x=>{
   if(globalListener&&callRef.current?.roomId!==x.roomId&&incomingRef.current?.roomId!==x.roomId)return;
   if(x.status==='accepted'){
    setStatus('Appel accepté — connexion audio en cours');
    const peer=peerRef.current,pc=pcRef.current;
    if(peer&&pc?.localDescription?.type==='offer'){socket.emit('webrtc:signal',{to:peer.otherId,roomId:peer.roomId,signal:pc.localDescription});for(const candidate of localCandidatesRef.current)socket.emit('webrtc:signal',{to:peer.otherId,roomId:peer.roomId,signal:{candidate}})}
   }else if(['ended','rejected','missed'].includes(x.status)){
    cleanup();
    setStatus(x.status==='rejected'?'Appel refusé':x.status==='missed'?'Appel sans réponse':'Votre correspondant a terminé l’appel');
   }
  });

  return()=>{
   alive=false;
   if(incomingPoll)window.clearInterval(incomingPoll);
   cleanup();
   socket.disconnect();
   socketRef.current=null;
  };
 },[globalListener,listenIncoming,initialRecipientId,restaurantId]);

 function playRingTone(){
  try{
   const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;
   const context=ringContextRef.current||(ringContextRef.current=new AudioContextClass());
   if(context.state==='suspended')context.resume().catch(()=>{});
   const now=context.currentTime;
   [0,0.42].forEach(offset=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=880;gain.gain.setValueAtTime(0.0001,now+offset);gain.gain.exponentialRampToValueAtTime(0.075,now+offset+0.025);gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.28);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now+offset);oscillator.stop(now+offset+0.3)});
  }catch(error){console.warn('Sonnerie audio non disponible',error)}
 }
 function unlockCallAudio(){
  try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){const context=ringContextRef.current||(ringContextRef.current=new AudioContextClass());context.resume().catch(()=>{})}if(remoteRef.current?.srcObject)remoteRef.current.play().then(()=>setAudioNeedsTap(false)).catch(()=>setAudioNeedsTap(true))}catch{}
 }
 useEffect(()=>{
  if(!globalListener)return;
  const unlock=()=>unlockCallAudio();window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock)};
 },[globalListener]);
 useEffect(()=>{
  if(!incoming){if(ringTimerRef.current)window.clearInterval(ringTimerRef.current);ringTimerRef.current=null;try{navigator.vibrate?.(0)}catch{};return}
  playRingTone();ringTimerRef.current=window.setInterval(()=>{playRingTone();try{navigator.vibrate?.([250,120,250])}catch{}},1800);
  return()=>{if(ringTimerRef.current)window.clearInterval(ringTimerRef.current);ringTimerRef.current=null;try{navigator.vibrate?.(0)}catch{}};
 },[incoming?.roomId]);

 async function sendMessage(e){
  e.preventDefault();setMessageFeedback('');
  try{const payload=restaurantId?{restaurantId,body:messageBody.trim()}:{recipientId:recipient,body:messageBody.trim()};
   const saved=await api('/communication/messages',{method:'POST',body:JSON.stringify(payload)});
   setMessages(rows=>rows.some(x=>x._id===saved._id)?rows:[...rows,saved]);setMessageBody('');setMessageFeedback('Message envoyé.');
  }catch(error){setMessageFeedback(error.message)}
 }

 async function startCall(e){
  e.preventDefault();unlockCallAudio();setStatus('Préparation de l’appel…');
  try{
   await ensureMicrophone();
   const targetId=recipient.trim();
   if(!restaurantId&&!targetId)throw new Error('Choisissez un correspondant.');
   const callPayload=restaurantId?{restaurantId,kind:'audio'}:{calleeId:targetId,kind:'audio'};
   const created=await api('/communication/calls',{method:'POST',body:JSON.stringify(callPayload)});
   callRef.current=created;
   setCall(created);
   acceptedRef.current=true;
   const peerId=created.calleeId||targetId;
   const pc=await makePeer(peerId,created.roomId);
   const offer=await pc.createOffer();
   await pc.setLocalDescription(offer);
   socketRef.current?.emit('webrtc:signal',{to:peerId,roomId:created.roomId,signal:pc.localDescription});
   setStatus('Appel audio envoyé — en attente de réponse');
  }catch(e){
   setStatus(e.message);
   cleanup();
  }
 }

 async function acceptCall(){
  if(!incoming)return;
  unlockCallAudio();
  try{
   await ensureMicrophone();
   const current=incoming;
   await api(`/communication/calls/${current.roomId}`,{method:'PATCH',body:JSON.stringify({status:'accepted'})});
   callRef.current={roomId:current.roomId};
   setCall({roomId:current.roomId});
   acceptedRef.current=true;
   setIncoming(null);
   incomingRef.current=null;
   setStatus('Appel accepté — connexion en cours');
   if(pendingOfferRef.current?.roomId===current.roomId){
    await answerOffer(pendingOfferRef.current);
   }
  }catch(e){setStatus(e.message)}
 }

 async function rejectCall(){
  if(!incoming)return;
  const current=incoming;
  try{
   await api(`/communication/calls/${current.roomId}`,{method:'PATCH',body:JSON.stringify({status:'rejected'})});
  }catch(e){setStatus(e.message)}
  setIncoming(null);
  incomingRef.current=null;
  if(ringTimerRef.current)window.clearInterval(ringTimerRef.current);ringTimerRef.current=null;try{navigator.vibrate?.(0)}catch{}
  setStatus('Appel refusé');
 }

 async function endCall(){
  const current=callRef.current||call;
  if(current?.roomId){
   try{await api(`/communication/calls/${current.roomId}`,{method:'PATCH',body:JSON.stringify({status:'ended'})})}catch(e){console.warn('Fin d’appel non confirmée par le serveur',e)}
  }
  cleanup();
  setStatus('Appel terminé');
 }

 function toggleMute(){
  const next=!muted;
  localRef.current?.getAudioTracks().forEach(track=>{track.enabled=!next});
  setMuted(next);
 }

 if(globalListener)return <div className="dunu-global-call-layer">
  {incoming&&<div className="incoming-call-overlay" role="alertdialog" aria-live="assertive" aria-label="Appel audio entrant"><div className="incoming-call-icon"><Phone size={24}/></div><span className="eyebrow">APPEL AUDIO ENTRANT</span><h2>{incoming.caller?.name||'Un utilisateur'} vous appelle</h2><p>Votre téléphone ou ordinateur sonne. Acceptez pour démarrer la conversation audio.</p><div className="actions"><button className="primary" onClick={acceptCall}>Accepter l’appel</button><button className="secondary" onClick={rejectCall}>Refuser</button></div></div>}
  {call&&<div className="active-call-overlay"><span>{status}</span>{audioNeedsTap&&<button className="secondary" onClick={unlockCallAudio}>Activer le son</button>}<button className="secondary" onClick={toggleMute}>{muted?'Activer le micro':'Couper le micro'}</button><button className="call-hangup" onClick={endCall}>Terminer l’appel</button></div>}
  <audio ref={remoteRef} autoPlay playsInline/>
 </div>;
 return <section className="panel dunu-communication">
  <div className="pagehead"><div><span className="eyebrow">ESPACE UNIFIÉ</span><h2>Communication DUNU</h2><p>Messages et appels audio dans une seule conversation.</p></div></div>
  {!restaurantId&&<label>Correspondant<select value={recipient} onChange={e=>{setRecipient(e.target.value);setMessages([]);setMessageFeedback('')}}><option value="">Choisir un contact autorisé</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {({admin:'Administration nationale',master:'Master de ville',restaurant:'Restaurant',rider:'Livreur',client:'Client',finance:'Finance'})[c.role]||c.role} {c.city?`· ${c.city}`:''}</option>)}</select></label>}
  <p>{status}</p>


  {!call&&!incoming&&<div className="actions"><button type="button" className="primary" disabled={!recipient&&!restaurantId} onClick={()=>startCall({preventDefault(){}})}><Phone size={16}/> {restaurantId?'Appeler ce restaurant':'Appel audio'}</button></div>}

  <div className="dunu-chat-history" aria-live="polite">{messages.map(m=><article className={`dunu-chat-message ${String(m.sender)===String(user.id||user._id)?'mine':''}`} key={m._id}><p>{m.body}</p><small>{new Date(m.createdAt).toLocaleString('fr-FR')}</small></article>)}{!messages.length&&<p className="muted">Aucun message dans cette conversation. Commencez à écrire.</p>}</div>
  <form className="dish-form dunu-chat-compose" onSubmit={sendMessage}><label>Votre message<textarea required maxLength={2000} rows={2} value={messageBody} onChange={e=>setMessageBody(e.target.value)} placeholder="Écrire un message…"/></label><div className="actions"><button className="primary" disabled={!recipient&&!restaurantId||!messageBody.trim()}><MessageCircle size={16}/> Envoyer</button></div></form>
  {messageFeedback&&<p className={messageFeedback==='Message envoyé.'?'success':'error'}>{messageFeedback}</p>}
  <audio ref={remoteRef} autoPlay playsInline/>

  {call&&<div className="actions">
   <button className="secondary" onClick={toggleMute}>{muted?'Activer le micro':'Couper le micro'}</button>
   <button className="call-hangup" onClick={endCall}>Terminer l’appel</button>
  </div>}

  <small>Messages et appels audio partagent cette conversation. La liste affiche uniquement les contacts que votre rôle et vos commandes vous autorisent à joindre. Les appels DUNU utilisent WebRTC audio uniquement. La connexion directe est privilégiée ; le serveur TURN peut prendre le relais lorsque le réseau mobile ou Wi-Fi bloque la connexion directe. Autorisez l’accès au microphone pour appeler.</small>
 </section>
}

function RouteMap({origin,destination}){
 const mapNode=useRef(null),mapRef=useRef(null),riderMarker=useRef(null),customerMarker=useRef(null),routeLayer=useRef(null);
 const [eta,setEta]=useState(null),[routeError,setRouteError]=useState(''),[mapReady,setMapReady]=useState(false);
 const leafletUrl='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
 useEffect(()=>{
  let cancelled=false;
  const load=()=>new Promise((resolve,reject)=>{
   if(window.L){resolve(window.L);return}
   let script=document.querySelector('script[data-dunu-leaflet]');
   if(script){script.addEventListener('load',()=>resolve(window.L),{once:true});script.addEventListener('error',reject,{once:true});return}
   script=document.createElement('script');script.src=leafletUrl;script.async=true;script.dataset.dunuLeaflet='1';script.onload=()=>resolve(window.L);script.onerror=reject;document.head.appendChild(script);
  });
  const cssId='dunu-leaflet-css';
  if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(link)}
  load().then(L=>{
   if(cancelled||!mapNode.current||mapRef.current)return;
   const map=L.map(mapNode.current,{zoomControl:true,scrollWheelZoom:false}).setView([Number(origin.lat),Number(origin.lng)],15);
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
   mapRef.current=map;
   riderMarker.current=L.marker([Number(origin.lat),Number(origin.lng)]).addTo(map).bindPopup('Livreur DUNU');
   if(destination?.lat!=null&&destination?.lng!=null)customerMarker.current=L.marker([Number(destination.lat),Number(destination.lng)]).addTo(map).bindPopup('Adresse de livraison');
   setMapReady(true);
   setTimeout(()=>map.invalidateSize(),150);
  }).catch(()=>{if(!cancelled)setRouteError('Carte indisponible. Vérifiez votre connexion internet.')});
  return()=>{cancelled=true;if(mapRef.current){mapRef.current.remove();mapRef.current=null;riderMarker.current=null;customerMarker.current=null;routeLayer.current=null}};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map||!riderMarker.current||!origin)return;
  const from=[Number(origin.lat),Number(origin.lng)];
  riderMarker.current.setLatLng(from);
  map.panTo(from,{animate:true,duration:.5});
 },[origin?.lat,origin?.lng,mapReady]);

 useEffect(()=>{
  const map=mapRef.current,L=window.L;if(!map||!L||!origin||!destination?.lat||!destination?.lng)return;
  const from=[Number(origin.lat),Number(origin.lng)],to=[Number(destination.lat),Number(destination.lng)];
  if(customerMarker.current)customerMarker.current.setLatLng(to);else customerMarker.current=L.marker(to).addTo(map).bindPopup('Adresse de livraison');
  let active=true;
  fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`)
   .then(r=>{if(!r.ok)throw new Error('route');return r.json()})
   .then(data=>{
    if(!active||!data.routes?.[0])return;
    setEta(Math.max(1,Math.round(data.routes[0].duration/60)));
    if(routeLayer.current)routeLayer.current.remove();
    routeLayer.current=L.geoJSON(data.routes[0].geometry,{style:{color:'#7b1025',weight:5,opacity:.85}}).addTo(map);
   }).catch(()=>{if(active)setRouteError('Itinéraire indisponible pour le moment')});
  return()=>{active=false};
 },[destination?.lat,destination?.lng,mapReady]);
 return <section className="route-map"><h3>Suivi GPS en direct du livreur</h3><p>{eta?`Temps de trajet estimé : environ ${eta} min`:(routeError||'Calcul de l’itinéraire…')}</p><div className="live-map" ref={mapNode} role="application" aria-label="Carte du déplacement du livreur"/><div className="map-legend"><span><i className="map-dot rider-dot"/> Position actuelle du livreur</span><span><i className="map-dot customer-dot"/> Adresse de livraison</span></div><small>La position du livreur se met à jour automatiquement lorsqu’il partage son GPS. Temps estimé indicatif, variable selon la circulation.</small><small className="muted">La carte et le déplacement restent visibles directement dans DUNU ; aucun navigateur externe n’est nécessaire.</small></section>
}

function Track(){
 const[params]=useSearchParams();
 const[code,setC]=useState(params.get('code')||''),[data,setD]=useState(null),[err,setE]=useState(''),[location,setLocation]=useState(null);
 async function go(e){e.preventDefault();setE('');try{const row=await api(`/orders/track/${encodeURIComponent(code)}`);setD(row);const loc=await api(`/orders/track/${encodeURIComponent(code)}/location`);setLocation(loc.location)}catch(e){setE(e.message)}}
 useEffect(()=>{if(!data?.code||!token())return;const socket=io(import.meta.env.VITE_API_URL||undefined,{auth:{token:token()}});socket.emit('order:watch',data.code);socket.on('location:changed',setLocation);socket.on('order:updated',setD);return()=>socket.disconnect()},[data?.code]);
 useEffect(()=>{if(!data?.code||!token())return;let active=true;const refreshLocation=()=>api(`/orders/track/${encodeURIComponent(data.code)}/location`).then(row=>{if(active)setLocation(row.location)}).catch(()=>{});refreshLocation();const timer=setInterval(refreshLocation,5000);return()=>{active=false;clearInterval(timer)}},[data?.code]);
 return <main className="auth"><form className="panel" onSubmit={go}><span className="eyebrow">SUIVI DE LIVRAISON</span><h1>Suivre ma commande</h1><label>Code de commande<input required value={code} onChange={e=>setC(e.target.value)} placeholder="DUNU-261112-1234"/></label><button className="primary full">Rechercher</button>{err&&<p className="error">{err}</p>}{data&&<div className="trackresult"><h3>{data.code}</h3><b>{data.status}</b><p>{data.restaurant?.name}</p><p>{data.deliveryAddress}</p><p>Montant : {data.total?.toLocaleString('fr-FR')} FCFA</p><p className="muted">Étape de livraison : {({placed:'Commande reçue',accepted:'Commande acceptée',preparing:'Préparation en cours',ready:'Commande prête',picked_up:'Commande récupérée par le livreur',on_the_way:'Livreur en route',delivered:'Livrée',cancelled:'Annulée'})[data.status]||data.status}</p>{location?<><p><MapPin size={15}/> Dernière position reçue à {new Date(location.at).toLocaleTimeString('fr-FR')}</p><RouteMap origin={location} destination={data.customerLocation}/>{!data.customerLocation&&<p className="muted">La position du livreur est visible. Pour afficher également l’itinéraire jusqu’à votre porte, activez la localisation au moment de la commande.</p>}</>:<p className="muted">La carte en direct apparaîtra lorsque le livreur sera en livraison et aura autorisé le GPS. Vous pouvez suivre les étapes de la commande en attendant.</p>}</div>}</form></main>
}

export default App;