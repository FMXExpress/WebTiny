var pas = { $libimports: {}};

var rtl = {

  version: 30200,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist);
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var r = Object.create(rtl.tSectionRTTI);
    var module = r.$module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: null,
      $impl: null,
      $rtti: r
    };
    if (impluseslist) module.$impl = {
          $module: module,
          $rtti: r
        };
  },

  exitcode: 0,

  run: function(module_name){
    try {
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if ((module_name=='program') || (module_name=='library')){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas[module_name].$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    } catch(re) {
      if (!rtl.showUncaughtExceptions) {
        throw re
      } else {  
        if (!rtl.handleUncaughtException(re)) {
          rtl.showException(re);
          rtl.exitcode = 216;
        }  
      }
    } 
    return rtl.exitcode;
  },
  
  showException : function (re) {
    var errStack="";
    if (rtl.isObject(re) && re.hasOwnProperty('FJSError') && rtl.isObject(re.FJSError) && !(re.FJSError.stack==undefined)) // rtl Exception
      errStack=re.FJSError.stack
    else if (rtl.isObject(re) && re.hasOwnProperty('stack') && !(re.stack==undefined)) // native JS Error
      errStack=re.stack
    else
      errStack=re; // unknown object
    var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
    errMsg += ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : '');
    errMsg += ((errMsg) ? "\n" : '') + errStack;
    errMsg = "Uncaught Exception:\n" + errMsg;
    console.log(errMsg);
    alert(errMsg);
  },

  handleUncaughtException: function (e) {
    if (rtl.onUncaughtException) {
      try {
        rtl.onUncaughtException(e);
        return true;
      } catch (ee) {
        return false; 
      }
    } else {
      return false;
    }
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  createSafeCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope[fn]) return null;
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        try{
          return scope[fn].apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    } else if(!fn) {
      return null;
    } else {
      cb = function(){
        try{
          return fn.apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a===b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn===b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn,rttiname){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$classname,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn,rttiname){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn,rttiname){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var isFunc = rtl.isFunction(ancestor);
    var c = null;
    if (isFunc){
      // create pascal class descendent from JS function
      c = Object.create(ancestor.prototype);
      c.$ancestorfunc = ancestor;
      c.$ancestor = null; // no pascal ancestor
    } else if (ancestor.$func){
      // create pascal class descendent from a pascal class descendent of a JS function
      isFunc = true;
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
    } else {
      c = Object.create(ancestor);
      c.$ancestor = null; // no pascal ancestor
    }
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else if(isFunc) {
        o = new this.$func(args);
      } else {
        o = Object.create(c);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          this[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) o.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
    if (isFunc){
      function f(){}
      f.prototype = c;
      c.$func = f;
    }
  },

  createHelper: function(parent,name,ancestor,initfn,rttiname){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$classname,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  hideProp: function(o,p,v){
    Object.defineProperty(o,p, {
      enumerable: false,
      configurable: true,
      writable: true
    });
    if(arguments.length>2){ o[p]=v; }
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    var h = rtl.hideProp;
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      h(t,'$record');
      h(t,'$name');
      h(t,'$parent');
      h(t,'$module');
      h(t,'$initSpec');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(t); };
    }
    t.$clone = function(r){ return t.$new().$assign(r); };
    h(t,'$new');
    h(t,'$clone');
    h(t,'$eq');
    h(t,'$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (!mod) mod = pas["System.SysUtils"];
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
      if (t) rtl[typename]=t;
    }
    if (t) {
      
      if (t.Create){
        var e = t.$create("Create");
      } else if (t.create) {
        var e = t.$create("create");
      }
      if (e) {
        e.FJSError = new Error;
        throw e ;
      }
    }
    if (typename === "EInvalidCast") throw new Error("invalid type cast");
    if (typename === "EAbstractError") throw new Error("Abstract method called");
    if (typename === "ERangeError") throw new Error("range error");
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn, rttiname){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = rttiname?rttiname:name;
    i.$fullname = module.$name+'.'+i.$name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(i.$name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (!intf) return null;
    var i = rtl.getIntfG(intf.$o,intftype.$guid);
    if (i) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      if(intf) {
        this[id]=intf;
      }
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          var intf = this[id];
          if (intf){
            //console.log('rtl.intfRefs.free: id='+id+' '+intf.$name+' $o='+intf.$o.$classname);
            intf._Release();
          }
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  trunc: function(a){
    return a<0 ? Math.ceil(a) : Math.floor(a);
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arrayRef: function(a){
    if (a!=null) rtl.hideProp(a,'$pas2jsrefcnt',2);
    return a;
  },

  arrayManaged: function(refCnt,mode,a){
    // mode: 0: don't touch elements, 1: null elements, 2: _AddRef elements
    if(!a) a = [];
    a.$pas2jsrefcnt = refCnt?refCnt:0;
    a._AddRef = function(){
      this.$pas2jsrefcnt++;
    };
    a._Release = function(){
      this.$pas2jsrefcnt--;
      if (this.$pas2jsrefcnt==0){
        for (var i=0; i<this.length; i++){
          rtl.setIntfP(this,i,null);
        }
      }
    };
    if (mode>0){
      for (var i=0; i<a.length; i++){
        if (mode === 2){
          rtl._AddRef(a[i]);
        } else {
          a[i]=null;
        }
      }
    }
    return a;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    var s = 9999;
    for (var i=2; i<arguments.length; i++){
      var j = arguments[i];
      if (j==='s'){ s = i-2; }
      else {
        stack.push({ dim:j+0, a:null, i:0, src:null });
      }
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var newlen = 0;
    var item = null;
    var a = null;
    var src = arr;
    var srclen = 0, oldlen = 0;
    var type = 0;
    var managed = false;
    if (rtl.isArray(defaultvalue)){
      // array of dyn array
      type = 1;
    } else if (rtl.isObject(defaultvalue)) {
      if (rtl.isTRecord(defaultvalue)){
        // array of record
        type = 2;
      } else {
        // array of set
        type = 3;
      }
    } else if (defaultvalue == 'R'){
      // array of COM interface
      type = 4;
      managed = true;
    }

    do{
      if (depth>0){
        item = stack[depth-1];
        src = (item.src && item.src.length>item.i) ? item.src[item.i] : null;
      }
      if (!src){
        // init array
        managed ? a=rtl.arrayManaged(1) : a=[];
        srclen = 0;
        oldlen = 0;
      } else if (src.$pas2jsrefcnt>1 || depth>=s){
        // clone
        if (managed){
          a = rtl.arrayManaged(1);
          src.$pas2jsrefcnt--;
        } else {
          a = [];
        }
        srclen = src.length;
        oldlen = srclen;
      } else {
        // keep old
        a = src;
        srclen = 0;
        oldlen = a.length;
      }
      newlen = stack[depth].dim;
      if (managed){
        if (a.length>=newlen){
          // shrink -> release elements
          for (var i=a.length-1; i>=newlen; i--){
            rtl.setIntfP(a,i,null);
          }
          a.length = newlen;
        } else {
          // enlarge -> null elements
          var l = a.length;
          a.length = newlen;
          for (var i=l; i<newlen; i++){
            a[i]=null;
          }
          oldlen = newlen;
        }
      } else {
        a.length = newlen;
      }
      if (depth>0){
        item.a[item.i]=a;
        item.i++;
        if ((newlen===0) && (item.i<item.a.length)) continue;
      }
      if (newlen>0){
        if (depth<dimmax){
          item = stack[depth];
          item.a = a;
          item.i = 0;
          item.src = src;
          depth++;
          continue;
        } else {
          if (srclen>newlen) srclen=newlen;
          if (type == 0){
            // array of simple value
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue;
          } else if (type == 1){
            // array of dyn array
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<newlen; i++) a[i]=[];
          } else if (type == 2) {
            // array of record
            for (var i=0; i<srclen; i++) a[i]=defaultvalue.$clone(src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue.$new();
          } else if (type == 3) {
            // array of set
            for (var i=0; i<srclen; i++) a[i]=rtl.refSet(src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]={};
          } else if (type == 4){
            // array of interface
            for (var i=0; i<srclen; i++) rtl.setIntfP(a,i,src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]=null;
          }
        }
      }
      // backtrack
      while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
        depth--;
      };
      if (depth===0){
        return dimmax===0 ? a : stack[0].a;
      }
    }while (true);
  },

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references or simple values
    // src must not be null
    // dst at dstpos must not contain managed old values
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (type === 'slice'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos].slice(0); // clone static array of simple types
    } else if (typeof(type)==='function'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type(src[srcpos]); // clone function
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    } else if (type === 'R'){
      // clone managed instance
      for (; srcpos<endpos; srcpos++){
        dst[dstpos++]=rtl._AddRef(src[srcpos]);
      }
    } else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    // returns refCnt=1
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    if (type === 'R'){
      rtl.arrayManaged(1,1,a);
    }
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=0; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=rtl.arrayRef(src); // Note: concat(arr) does not clone
      } else if (a.$pas2jsrefcnt>1){
        a=a.concat(src); // clone a and append src
      } else {
        for (var i=0; i<src.length; i++){
          a.push(src[i]);
        }
      }
    };
    return a;
  },

  arrayPush: function(type,a){
    if(a===null){
      a=(type==='R') ? rtl.arrayManaged(1) : [];
    } else if (a.$pas2jsrefcnt>1){
      a=rtl.arrayCopy(type,a,0,a.length);
    }
    rtl.arrayClone(type,arguments,2,arguments.length,a,a.length);
    return a;
  },

  arrayPushN: function(a){
    if(a===null){
      a=[];
    } else if (a.$pas2jsrefcnt>1){
      a=a.concat();
    }
    for (var i=1; i<arguments.length; i++){
      a.push(arguments[i]);
    }
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return (type === 'R') ? null : [];
    if (count === undefined) count=srcarray.length;
    if (index < 0){
      count+=index;
      index = 0;
    }
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return (type === 'R') ? null : [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      if (type === 'R'){
        rtl.arrayManaged(1,1,a);
      }
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  arrayInsert: function(item, a, index, type){
    var m = (type === 'R');
    if (m) rtl._AddRef(item);
    if (a){
      if (a.$pas2jsrefcnt>1){
        if (m){
          // clone
          a.$pas2jsrefcnt--;
          a=rtl.arrayManaged(1,2,a.concat());
        } else {
          a=a.concat();
        }
      }
      a.splice(index,0,item);
      return a;
    } else {
      a = [item];
      if (m) a=rtl.arrayManaged(1,0,a);
      return a;
    }
  },

  arrayDeleteR: function(a, index, count){
    if (a===null || index<0 || index>=a.length || count<=0) return a;
    if (index+count>a.length) count=a.length-index;
    if (a.$pas2jsrefcnt>1){
      // clone
      a.$pas2jsrefcnt--;
      a=rtl.arrayManaged(1,2,a.concat());
    }
    for (var i=0; i<count; i++) rtl.setIntfP(a,index+i,null);
    a.splice(index,count);
    return a;
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    rtl.hideProp(s,'$shared',true);
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (((ad>1) && (ad<1.0e+10)) ||  ((ad>1.e-10) && (ad<1))) {
		pad='00';
	  } else if ((ad>1) && (ad<1.0e+100) || (ad<1.e-10)) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=24;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo", kind: 0, $module: null, attr: null };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseInt("char",0,65535,3 /* word */).kind=2 /* tkChar */;
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = { attr: null };
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,vis,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      t.visibility = vis;
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,vis,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,vis?vis:2,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,vis,result,flags,options){
      // optional: vis, result, flags, options
      var t = this.$addMember(name,rtl.tTypeMemberMethod,vis?vis:2,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params,result,flags);
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,vis,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,vis?vis:4,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      t.params = rtl.isArray(t.params) ? rtl.newTIParams(t.params) : null;
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o,typ){ if(typ) o.$record = typ; return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result?result:null,
      flags: flags?flags:0
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  }
}

rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  var $lt = null;
  var $lt1 = null;
  var $lt2 = null;
  var $lt3 = null;
  var $lt4 = null;
  var $lt5 = null;
  var $lt6 = null;
  var $lt7 = null;
  var $lt8 = null;
  var $lt9 = null;
  var $lt10 = null;
  var $lt11 = null;
  var $lt12 = null;
  var $lt13 = null;
  var $lt14 = null;
  var $lt15 = null;
  var $lt16 = null;
  var $lt17 = null;
  this.LineEnding = "\n";
  this.sLineBreak = this.LineEnding;
  this.PathDelim = "/";
  this.$rtti.$Set("AllowDirectorySeparators$a",{comptype: rtl.char});
  this.AllowDirectorySeparators = rtl.createSet(47);
  this.$rtti.$Set("AllowDriveSeparators$a",{comptype: rtl.char});
  this.AllowDriveSeparators = rtl.createSet(58);
  this.ExtensionSeparator = ".";
  this.MaxSmallint = 32767;
  this.MinSmallint = -32768;
  this.MaxShortInt = 127;
  this.MinShortInt = -128;
  this.MaxByte = 0xFF;
  this.MaxWord = 0xFFFF;
  this.MaxLongint = 0x7fffffff;
  this.MaxCardinal = 0xffffffff;
  this.Maxint = 2147483647;
  this.IsMultiThread = false;
  this.$rtti.$inherited("Real",rtl.double,{});
  this.$rtti.$inherited("Extended",rtl.double,{});
  this.$rtti.$inherited("TDateTime",rtl.double,{});
  this.$rtti.$inherited("TTime",this.$rtti["TDateTime"],{});
  this.$rtti.$inherited("TDate",this.$rtti["TDateTime"],{});
  this.$rtti.$inherited("Int64",rtl.nativeint,{});
  this.$rtti.$inherited("UInt64",rtl.nativeuint,{});
  this.$rtti.$inherited("QWord",rtl.nativeuint,{});
  this.$rtti.$inherited("Single",rtl.double,{});
  this.$rtti.$inherited("Comp",rtl.nativeint,{});
  this.$rtti.$inherited("UnicodeString",rtl.string,{});
  this.$rtti.$inherited("WideString",rtl.string,{});
  $lt = this.TTextLineBreakStyle = {"0": "tlbsLF", tlbsLF: 0, "1": "tlbsCRLF", tlbsCRLF: 1, "2": "tlbsCR", tlbsCR: 2};
  this.$rtti.$Enum("TTextLineBreakStyle",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TTextLineBreakStyle});
  $lt1 = this.TCompareOption = {"0": "coIgnoreCase", coIgnoreCase: 0};
  this.$rtti.$Enum("TCompareOption",{minvalue: 0, maxvalue: 0, ordtype: 1, enumtype: this.TCompareOption});
  this.$rtti.$Set("TCompareOptions",{comptype: this.$rtti["TCompareOption"]});
  rtl.recNewT(this,"TGuid",function () {
    $lt2 = this;
    this.D1 = 0;
    this.D2 = 0;
    this.D3 = 0;
    this.$new = function () {
      var r = Object.create(this);
      r.D4 = rtl.arraySetLength(null,0,8);
      return r;
    };
    this.$eq = function (b) {
      return (this.D1 === b.D1) && (this.D2 === b.D2) && (this.D3 === b.D3) && rtl.arrayEq(this.D4,b.D4);
    };
    this.$assign = function (s) {
      this.D1 = s.D1;
      this.D2 = s.D2;
      this.D3 = s.D3;
      this.D4 = s.D4.slice(0);
      return this;
    };
    var $r = $mod.$rtti.$Record("TGuid",{},this);
    $r.addField("D1",rtl.longword);
    $r.addField("D2",rtl.word);
    $r.addField("D3",rtl.word);
    $mod.$rtti.$StaticArray("TGuid.D4$a",{dims: [8], eltype: rtl.byte});
    $r.addField("D4",$mod.$rtti["TGuid.D4$a"]);
  });
  this.$rtti.$inherited("TGUIDString",rtl.string,{});
  rtl.recNewT(this,"TMethod",function () {
    $lt3 = this;
    this.Code = null;
    this.Data = null;
    this.$eq = function (b) {
      return (this.Code === b.Code) && (this.Data === b.Data);
    };
    this.$assign = function (s) {
      this.Code = s.Code;
      this.Data = s.Data;
      return this;
    };
    var $r = $mod.$rtti.$Record("TMethod",{},this);
    $r.addField("Code",rtl.pointer);
    $r.addField("Data",rtl.pointer);
  });
  this.$rtti.$Pointer("PMethod",{reftype: this.$rtti["TMethod"]});
  this.$rtti.$Class("TObject");
  this.$rtti.$ClassRef("TClass",{instancetype: this.$rtti["TObject"]});
  rtl.createClass(this,"TObject",null,function () {
    $lt4 = this;
    this.$init = function () {
    };
    this.$final = function () {
    };
    this.Create = function () {
      return this;
    };
    this.Destroy = function () {
    };
    this.Free = function () {
      this.$destroy("Destroy");
    };
    this.ClassType = function () {
      return this;
    };
    this.ClassNameIs = function (Name) {
      var Result = false;
      Result = $impl.SameText(Name,this.$classname);
      return Result;
    };
    this.InheritsFrom = function (aClass) {
      return (aClass!=null) && ((this==aClass) || aClass.isPrototypeOf(this));
    };
    this.MethodName = function (aCode) {
      var Result = "";
      Result = "";
      if (aCode === null) return Result;
      if (typeof(aCode)!=='function') return "";
      var i = 0;
      var TI = this.$rtti;
      if (rtl.isObject(aCode.scope)){
        // callback
        if (typeof aCode.fn === "string") return aCode.fn;
        aCode = aCode.fn;
      }
      // Not a callback, check rtti
      while ((Result === "") && (TI != null)) {
        i = 0;
        while ((Result === "") && (i < TI.methods.length)) {
          if (this[TI.getMethod(i).name] === aCode)
            Result=TI.getMethod(i).name;
          i += 1;
        };
        if (Result === "") TI = TI.ancestor;
      };
      // return Result;
      return Result;
    };
    this.MethodAddress = function (aName) {
      var Result = null;
      Result = null;
      if (aName === "") return Result;
      var i = 0;
        var TI = this.$rtti;
        var N = "";
        var MN = "";
        N = aName.toLowerCase();
        while ((MN === "") && (TI != null)) {
          i = 0;
          while ((MN === "") && (i < TI.methods.length)) {
            if (TI.getMethod(i).name.toLowerCase() === N) MN = TI.getMethod(i).name;
            i += 1;
          };
          if (MN === "") TI = TI.ancestor;
        };
        if (MN !== "") Result = this[MN];
      //  return Result;
      return Result;
    };
    this.FieldAddress = function (aName) {
      var Result = null;
      Result = null;
      if (aName === "") return Result;
      var aClass = this.$class;
      var ClassTI = null;
      var myName = aName.toLowerCase();
      var MemberTI = null;
      while (aClass !== null) {
        ClassTI = aClass.$rtti;
        for (var i = 0, $end2 = ClassTI.fields.length - 1; i <= $end2; i++) {
          MemberTI = ClassTI.getField(i);
          if (MemberTI.name.toLowerCase() === myName) {
             return MemberTI;
          };
        };
        aClass = aClass.$ancestor ? aClass.$ancestor : null;
      };
      return Result;
    };
    this.ClassInfo = function () {
      var Result = null;
      Result = this.$rtti;
      return Result;
    };
    this.QualifiedClassName = function () {
      var Result = "";
      Result = this.$module.$name + "." + this.$classname;
      return Result;
    };
    this.AfterConstruction = function () {
    };
    this.BeforeDestruction = function () {
    };
    this.Dispatch = function (aMessage) {
      var aClass = null;
      var Id = undefined;
      if (!rtl.isObject(aMessage)) return;
      Id = aMessage["Msg"];
      if (!rtl.isNumber(Id)) return;
      aClass = this.$class.ClassType();
      while (aClass !== null) {
        var Handlers = aClass.$msgint;
        if (rtl.isObject(Handlers) && Handlers.hasOwnProperty(Id)){
          this[Handlers[Id]](aMessage);
          return;
        };
        aClass = aClass.$ancestor;
      };
      this.DefaultHandler(aMessage);
    };
    this.DispatchStr = function (aMessage) {
      var aClass = null;
      var Id = undefined;
      if (!rtl.isObject(aMessage)) return;
      Id = aMessage["MsgStr"];
      if (!rtl.isString(Id)) return;
      aClass = this.$class.ClassType();
      while (aClass !== null) {
        var Handlers = aClass.$msgstr;
        if (rtl.isObject(Handlers) && Handlers.hasOwnProperty(Id)){
          this[Handlers[Id]](aMessage);
          return;
        };
        aClass = aClass.$ancestor;
      };
      this.DefaultHandlerStr(aMessage);
    };
    this.DefaultHandler = function (aMessage) {
      if (aMessage) ;
    };
    this.DefaultHandlerStr = function (aMessage) {
      if (aMessage) ;
    };
    this.GetInterface = function (iid, obj) {
      var Result = false;
      var i = iid.$intf;
      if (i){
        // iid is the private TGuid of an interface
        i = rtl.getIntfG(this,i.$guid,2);
        if (i){
          obj.set(i);
          return true;
        }
      };
      Result = this.GetInterfaceByStr(rtl.guidrToStr(iid),obj);
      return Result;
    };
    this.GetInterface$1 = function (iidstr, obj) {
      var Result = false;
      Result = this.GetInterfaceByStr(iidstr,obj);
      return Result;
    };
    this.GetInterfaceByStr = function (iidstr, obj) {
      var Result = false;
      Result = false;
      if (!$mod.IObjectInstance["$str"]) $mod.IObjectInstance["$str"] = rtl.guidrToStr($mod.IObjectInstance);
      if (iidstr == $mod.IObjectInstance["$str"]) {
        obj.set(this);
        return true;
      };
      var i = rtl.getIntfG(this,iidstr,2);
      obj.set(i);
      Result=(i!==null);
      return Result;
    };
    this.GetInterfaceWeak = function (iid, obj) {
      var Result = false;
      Result = this.GetInterface(iid,obj);
      if (Result){
        var o = obj.get();
        if (o.$kind==='com'){
          o._Release();
        }
      };
      return Result;
    };
    this.Equals = function (Obj) {
      var Result = false;
      Result = Obj === this;
      return Result;
    };
    this.ToString = function () {
      var Result = "";
      Result = this.$classname;
      return Result;
    };
  });
  rtl.createClass(this,"TCustomAttribute",$lt4,function () {
    $lt5 = this;
  });
  this.$rtti.$ClassRef("TCustomAttributeClass",{instancetype: this.$rtti["TCustomAttribute"]});
  this.$rtti.$DynArray("TCustomAttributeArray",{eltype: this.$rtti["TCustomAttribute"]});
  this.S_OK = 0;
  this.S_FALSE = 1;
  this.E_NOINTERFACE = -2147467262;
  this.E_UNEXPECTED = -2147418113;
  this.E_NOTIMPL = -2147467263;
  rtl.createInterface(this,"IUnknown","{00000000-0000-0000-C000-000000000046}",["QueryInterface","_AddRef","_Release"],null,function () {
    $lt6 = this;
    this.$kind = "com";
    var $r = this.$rtti;
    $r.addMethod("QueryInterface",1,[["iid",$mod.$rtti["TGuid"],2],["obj",null,4]],2,rtl.longint);
    $r.addMethod("_AddRef",1,[],2,rtl.longint);
    $r.addMethod("_Release",1,[],2,rtl.longint);
  });
  rtl.createInterface(this,"IInvokable","{88387EF6-BCEE-3E17-9E85-5D491ED4FC10}",[],$lt6,function () {
    $lt7 = this;
  });
  rtl.createInterface(this,"IEnumerator","{ECEC7568-4E50-30C9-A2F0-439342DE2ADB}",["GetCurrent","MoveNext","Reset"],$lt6,function () {
    $lt8 = this;
    var $r = this.$rtti;
    $r.addMethod("GetCurrent",1,[],2,$mod.$rtti["TObject"]);
    $r.addMethod("MoveNext",1,[],2,rtl.boolean);
    $r.addMethod("Reset",0,[]);
    $r.addProperty("Current",1,$mod.$rtti["TObject"],"GetCurrent","",2);
  });
  rtl.createInterface(this,"IEnumerable","{9791C368-4E51-3424-A3CE-D4911D54F385}",["GetEnumerator"],$lt6,function () {
    $lt9 = this;
    var $r = this.$rtti;
    $r.addMethod("GetEnumerator",1,[],2,$mod.$rtti["IEnumerator"]);
  });
  rtl.createClass(this,"TInterfacedObject",$lt4,function () {
    $lt10 = this;
    this.$init = function () {
      $lt4.$init.call(this);
      this.fRefCount = 0;
    };
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      if (this.GetInterface(iid,obj)) {
        Result = 0}
       else Result = -2147467262;
      return Result;
    };
    this._AddRef = function () {
      var Result = 0;
      this.fRefCount += 1;
      Result = this.fRefCount;
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      this.fRefCount -= 1;
      Result = this.fRefCount;
      if (this.fRefCount === 0) this.$destroy("Destroy");
      return Result;
    };
    this.BeforeDestruction = function () {
      if (this.fRefCount !== 0) rtl.raiseE('EHeapMemoryError');
    };
    rtl.addIntf(this,$lt6);
  });
  this.$rtti.$ClassRef("TInterfacedClass",{instancetype: this.$rtti["TInterfacedObject"]});
  rtl.createClass(this,"TAggregatedObject",$lt4,function () {
    $lt11 = this;
    this.$init = function () {
      $lt4.$init.call(this);
      this.fController = null;
    };
    this.GetController = function () {
      var Result = null;
      var $ok = false;
      try {
        Result = rtl.setIntfL(Result,this.fController);
        $ok = true;
      } finally {
        if (!$ok) rtl._Release(Result);
      };
      return Result;
    };
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      Result = this.fController.QueryInterface(iid,obj);
      return Result;
    };
    this._AddRef = function () {
      var Result = 0;
      Result = this.fController._AddRef();
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      Result = this.fController._Release();
      return Result;
    };
    this.Create$1 = function (aController) {
      $lt4.Create.call(this);
      this.fController = aController;
      return this;
    };
  });
  rtl.createClass(this,"TContainedObject",$lt11,function () {
    $lt12 = this;
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      if (this.GetInterface(iid,obj)) {
        Result = 0}
       else Result = -2147467262;
      return Result;
    };
    rtl.addIntf(this,$lt6);
  });
  this.IObjectInstance = $lt2.$clone({D1: 0xD91C9AF4, D2: 0x3C93, D3: 0x420F, D4: [0xA3,0x03,0xBF,0x5B,0xA8,0x2B,0xFD,0x23]});
  $lt13 = this.TTypeKind = {"0": "tkUnknown", tkUnknown: 0, "1": "tkInteger", tkInteger: 1, "2": "tkChar", tkChar: 2, "3": "tkString", tkString: 3, "4": "tkEnumeration", tkEnumeration: 4, "5": "tkSet", tkSet: 5, "6": "tkDouble", tkDouble: 6, "7": "tkBool", tkBool: 7, "8": "tkProcVar", tkProcVar: 8, "9": "tkMethod", tkMethod: 9, "10": "tkArray", tkArray: 10, "11": "tkDynArray", tkDynArray: 11, "12": "tkRecord", tkRecord: 12, "13": "tkClass", tkClass: 13, "14": "tkClassRef", tkClassRef: 14, "15": "tkPointer", tkPointer: 15, "16": "tkJSValue", tkJSValue: 16, "17": "tkRefToProcVar", tkRefToProcVar: 17, "18": "tkInterface", tkInterface: 18, "19": "tkHelper", tkHelper: 19, "20": "tkExtClass", tkExtClass: 20};
  this.$rtti.$Enum("TTypeKind",{minvalue: 0, maxvalue: 20, ordtype: 1, enumtype: this.TTypeKind});
  this.$rtti.$Set("TTypeKinds",{comptype: this.$rtti["TTypeKind"]});
  this.tkFloat = 6;
  this.tkProcedure = 8;
  this.tkAny = rtl.createSet(null,$lt13.tkUnknown,$lt13.tkExtClass);
  this.tkMethods = rtl.createSet(9);
  this.tkProperties = rtl.diffSet(rtl.diffSet(this.tkAny,this.tkMethods),rtl.createSet(0));
  this.vtInteger = 0;
  this.vtBoolean = 1;
  this.vtExtended = 3;
  this.vtPointer = 5;
  this.vtObject = 7;
  this.vtClass = 8;
  this.vtWideChar = 9;
  this.vtCurrency = 12;
  this.vtInterface = 14;
  this.vtUnicodeString = 18;
  this.vtNativeInt = 19;
  this.vtJSValue = 20;
  this.$rtti.$Pointer("PVarRec",{reftype: this.$rtti["TVarRec"]});
  rtl.recNewT(this,"TVarRec",function () {
    $lt14 = this;
    this.VType = 0;
    this.VJSValue = undefined;
    this.$eq = function (b) {
      return (this.VType === b.VType) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue);
    };
    this.$assign = function (s) {
      this.VType = s.VType;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      return this;
    };
    var $r = $mod.$rtti.$Record("TVarRec",{},this);
    $r.addField("VType",rtl.byte);
    $r.addField("VJSValue",rtl.jsvalue);
    $r.addField("VJSValue",rtl.longint);
    $r.addField("VJSValue",rtl.boolean);
    $r.addField("VJSValue",rtl.double);
    $r.addField("VJSValue",rtl.pointer);
    $r.addField("VJSValue",$mod.$rtti["TObject"]);
    $r.addField("VJSValue",$mod.$rtti["TClass"]);
    $r.addField("VJSValue",rtl.char);
    $r.addField("VJSValue",rtl.nativeint);
    $r.addField("VJSValue",rtl.pointer);
    $r.addField("VJSValue",$mod.$rtti["UnicodeString"]);
    $r.addField("VJSValue",rtl.nativeint);
  });
  this.$rtti.$DynArray("TVarRecArray",{eltype: this.$rtti["TVarRec"]});
  this.VarRecs = function () {
    var Result = [];
    var i = 0;
    var v = null;
    Result = [];
    while (i < arguments.length) {
      v = $lt14.$new();
      v.VType = rtl.trunc(arguments[i]);
      i += 1;
      v.VJSValue = arguments[i];
      i += 1;
      Result.push($lt14.$clone(v));
    };
    return Result;
  };
  this.IsConsole = false;
  this.FirstDotAtFileNameStartIsExtension = false;
  this.$rtti.$ProcVar("TOnParamCount",{procsig: rtl.newTIProcSig([],rtl.longint)});
  this.$rtti.$ProcVar("TOnParamStr",{procsig: rtl.newTIProcSig([["Index",rtl.longint]],rtl.string)});
  this.OnParamCount = null;
  this.OnParamStr = null;
  this.ParamCount = function () {
    var Result = 0;
    if ($mod.OnParamCount != null) {
      Result = $mod.OnParamCount()}
     else Result = 0;
    return Result;
  };
  this.ParamStr = function (Index) {
    var Result = "";
    if ($mod.OnParamStr != null) {
      Result = $mod.OnParamStr(Index)}
     else if (Index === 0) {
      Result = "js"}
     else Result = "";
    return Result;
  };
  this.Frac = function (A) {
    return A % 1;
  };
  this.Odd = function (A) {
    return A&1 != 0;
  };
  this.Random = function (Range) {
    return Math.floor(Math.random()*Range);
  };
  this.Sqr = function (A) {
    return A*A;
  };
  this.Sqr$1 = function (A) {
    return A*A;
  };
  this.Trunc = function (A) {
    if (!Math.trunc) {
      Math.trunc = function(v) {
        v = +v;
        if (!isFinite(v)) return v;
        return (v - v % 1) || (v < 0 ? -0 : v === 0 ? v : 0);
      };
    }
    $mod.Trunc = Math.trunc;
    return Math.trunc(A);
  };
  this.DefaultTextLineBreakStyle = 0;
  this.Int = function (A) {
    var Result = 0.0;
    Result = $mod.Trunc(A);
    return Result;
  };
  this.Copy = function (S, Index, Size) {
    if (Index<1) Index = 1;
    return (Size>0) ? S.substring(Index-1,Index+Size-1) : "";
  };
  this.Copy$1 = function (S, Index) {
    if (Index<1) Index = 1;
    return S.substr(Index-1);
  };
  this.Delete = function (S, Index, Size) {
    var h = "";
    if ((Index < 1) || (Index > S.get().length) || (Size <= 0)) return;
    h = S.get();
    S.set($mod.Copy(h,1,Index - 1) + $mod.Copy$1(h,Index + Size));
  };
  this.Pos = function (Search, InString) {
    return InString.indexOf(Search)+1;
  };
  this.Pos$1 = function (Search, InString, StartAt) {
    return InString.indexOf(Search,StartAt-1)+1;
  };
  this.Insert = function (Insertion, Target, Index) {
    var t = "";
    if (Insertion === "") return;
    t = Target.get();
    if (Index < 1) {
      Target.set(Insertion + t)}
     else if (Index > t.length) {
      Target.set(t + Insertion)}
     else Target.set($mod.Copy(t,1,Index - 1) + Insertion + $mod.Copy(t,Index,t.length));
  };
  this.upcase = function (c) {
    return c.toUpperCase();
  };
  this.binstr = function (val, cnt) {
    var Result = "";
    var i = 0;
    Result = rtl.strSetLength(Result,cnt);
    for (var $l = cnt; $l >= 1; $l--) {
      i = $l;
      Result = rtl.setCharAt(Result,i - 1,String.fromCharCode(48 + (val & 1)));
      val = Math.floor(val / 2);
    };
    return Result;
  };
  this.val = function (S, NI, Code) {
    NI.set($impl.valint(S,-9007199254740991,9007199254740991,Code));
  };
  this.val$1 = function (S, NI, Code) {
    var x = 0.0;
    if (S === "") {
      Code.set(1);
      return;
    };
    x = Number(S);
    if (isNaN(x) || (x !== $mod.Int(x)) || (x < 0)) {
      Code.set(1)}
     else {
      Code.set(0);
      NI.set($mod.Trunc(x));
    };
  };
  this.val$2 = function (S, SI, Code) {
    SI.set($impl.valint(S,-128,127,Code));
  };
  this.val$3 = function (S, B, Code) {
    B.set($impl.valint(S,0,255,Code));
  };
  this.val$4 = function (S, SI, Code) {
    SI.set($impl.valint(S,-32768,32767,Code));
  };
  this.val$5 = function (S, W, Code) {
    W.set($impl.valint(S,0,65535,Code));
  };
  this.val$6 = function (S, I, Code) {
    I.set($impl.valint(S,-2147483648,2147483647,Code));
  };
  this.val$7 = function (S, C, Code) {
    C.set($impl.valint(S,0,4294967295,Code));
  };
  this.val$8 = function (S, d, Code) {
    var x = 0.0;
    if (S === "") {
      Code.set(1);
      return;
    };
    x = Number(S);
    if (isNaN(x)) {
      Code.set(1)}
     else {
      Code.set(0);
      d.set(x);
    };
  };
  this.val$9 = function (S, b, Code) {
    if ($impl.SameText(S,"true")) {
      Code.set(0);
      b.set(true);
    } else if ($impl.SameText(S,"false")) {
      Code.set(0);
      b.set(false);
    } else Code.set(1);
  };
  this.StringOfChar = function (c, l) {
    var Result = "";
    var i = 0;
    if ((l>0) && c.repeat) return c.repeat(l);
    Result = "";
    for (var $l = 1, $end = l; $l <= $end; $l++) {
      i = $l;
      Result = Result + c;
    };
    return Result;
  };
  this.Write = function () {
    var i = 0;
    for (var $l = 0, $end = arguments.length - 1; $l <= $end; $l++) {
      i = $l;
      if ($impl.WriteCallBack != null) {
        $impl.WriteCallBack(arguments[i],false)}
       else $impl.WriteBuf = $impl.WriteBuf + ("" + arguments[i]);
    };
  };
  this.Writeln = function () {
    var i = 0;
    var l = 0;
    var s = "";
    l = arguments.length - 1;
    if ($impl.WriteCallBack != null) {
      for (var $l = 0, $end = l; $l <= $end; $l++) {
        i = $l;
        $impl.WriteCallBack(arguments[i],i === l);
      };
    } else {
      s = $impl.WriteBuf;
      for (var $l1 = 0, $end1 = l; $l1 <= $end1; $l1++) {
        i = $l1;
        s = s + ("" + arguments[i]);
      };
      console.log(s);
      $impl.WriteBuf = "";
    };
  };
  this.$rtti.$RefToProcVar("TConsoleHandler",{procsig: rtl.newTIProcSig([["S",rtl.jsvalue],["NewLine",rtl.boolean]])});
  this.SetWriteCallBack = function (H) {
    var Result = null;
    Result = $impl.WriteCallBack;
    $impl.WriteCallBack = H;
    return Result;
  };
  this.Assigned = function (V) {
    return (V!=undefined) && (V!=null) && (!rtl.isArray(V) || (V.length > 0));
  };
  this.StrictEqual = function (A, B) {
    return A === B;
  };
  this.StrictInequal = function (A, B) {
    return A !== B;
  };
  $mod.$implcode = function () {
    $impl.SameText = function (s1, s2) {
      return s1.toLowerCase() == s2.toLowerCase();
    };
    $impl.WriteBuf = "";
    $impl.WriteCallBack = null;
    $impl.valint = function (S, MinVal, MaxVal, Code) {
      var Result = 0;
      var x = 0.0;
      if (S === "") {
        Code.set(1);
        return Result;
      };
      x = Number(S);
      if (isNaN(x)) {
        var $tmp = $mod.Copy(S,1,1);
        if ($tmp === "$") {
          x = Number("0x" + $mod.Copy$1(S,2))}
         else if ($tmp === "&") {
          x = Number("0o" + $mod.Copy$1(S,2))}
         else if ($tmp === "%") {
          x = Number("0b" + $mod.Copy$1(S,2))}
         else {
          Code.set(1);
          return Result;
        };
      };
      if (isNaN(x) || (x !== $mod.Int(x))) {
        Code.set(1)}
       else if ((x < MinVal) || (x > MaxVal)) {
        Code.set(2)}
       else {
        Result = $mod.Trunc(x);
        Code.set(0);
      };
      return Result;
    };
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},[]);
rtl.module("Math",["System"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  var $lt = null;
  var $lm = pas.System;
  var $lp = $lm.Int;
  var $lp1 = $lm.Sqr$1;
  var $lp2 = $lm.Random;
  var $lp3 = $lm.Trunc;
  this.MinInteger = -0xfffffffffffff - 1;
  this.MaxInteger = 0xfffffffffffff;
  this.MinDouble = 5.0e-324;
  this.MaxDouble = 1.7e+308;
  this.Epsilon = 1.1e-10;
  this.InRange = function (AValue, AMin, AMax) {
    return (AValue >= AMin) && (AValue <= AMax);
  };
  this.InRange$1 = function (AValue, AMin, AMax) {
    return (AValue >= AMin) && (AValue <= AMax);
  };
  this.EnsureRange = function (AValue, AMin, AMax) {
    if (AValue<AMin){ return AMin;
    } else if (AValue>AMax){ return AMax;
    } else return AValue;
  };
  this.EnsureRange$1 = function (AValue, AMin, AMax) {
    if (AValue<AMin){ return AMin;
    } else if (AValue>AMax){ return AMax;
    } else return AValue;
  };
  this.$rtti.$Int("TRoundToRange",{minvalue: -37, maxvalue: 37, ordtype: 0});
  this.RoundTo = function (AValue, Digits) {
    var Result = 0.0;
    var RV = 0.0;
    RV = $mod.IntPower(10,Digits);
    Result = Math.round(AValue / RV) * RV;
    return Result;
  };
  this.SimpleRoundTo = function (AValue, Digits) {
    var Result = 0.0;
    var RV = 0.0;
    RV = $mod.IntPower(10,-Digits);
    if (AValue < 0) {
      Result = $lp((AValue * RV) - 0.5) / RV}
     else Result = $lp((AValue * RV) + 0.5) / RV;
    return Result;
  };
  this.randg = function (mean, stddev) {
    var Result = 0.0;
    var U1 = 0.0;
    var S2 = 0.0;
    do {
      U1 = (2 * Math.random()) - 1;
      S2 = $lp1(U1) + $lp1((2 * Math.random()) - 1);
    } while (!(S2 < 1));
    Result = (Math.sqrt((-2 * Math.log(S2)) / S2) * U1 * stddev) + mean;
    return Result;
  };
  this.RandomRange = function (aFrom, aTo) {
    var Result = 0;
    Result = $lp2(Math.abs(aFrom - aTo)) + Math.min(aTo,aFrom);
    return Result;
  };
  this.RandomRange$1 = function (aFrom, aTo) {
    var Result = 0;
    var m = 0;
    if (aFrom < aTo) {
      m = aFrom}
     else m = aTo;
    Result = $lp2(Math.abs(aFrom - aTo)) + m;
    return Result;
  };
  this.$rtti.$Int("TValueSign",{minvalue: -1, maxvalue: 1, ordtype: 0});
  this.NegativeValue = -1;
  this.ZeroValue = 0;
  this.PositiveValue = 1;
  this.IsZero = function (d, Epsilon) {
    var Result = false;
    if (Epsilon === 0) Epsilon = 1E-12;
    Result = Math.abs(d) <= Epsilon;
    return Result;
  };
  this.IsZero$1 = function (d) {
    var Result = false;
    Result = Math.abs(d) <= 1E-12;
    return Result;
  };
  this.IsInfinite = function (d) {
    return (d==Infinity) || (d==-Infinity);
  };
  this.SameValue = function (A, B, Epsilon) {
    var Result = false;
    if (Epsilon === 0.0) Epsilon = Math.max(Math.min(Math.abs(A),Math.abs(B)) * 1E-12,1E-12);
    if (A > B) {
      Result = (A - B) <= Epsilon}
     else Result = (B - A) <= Epsilon;
    return Result;
  };
  this.SinCos = function (A, B, C) {
    B.set(Math.sin(A));
    C.set(Math.cos(A));
  };
  this.LogN = function (Base, N) {
    var Result = 0.0;
    Result = Math.log(N) / Math.log(Base);
    return Result;
  };
  this.Ceil = function (A) {
    var Result = 0;
    Result = $lp3(Math.ceil(A));
    return Result;
  };
  this.Floor = function (A) {
    var Result = 0;
    Result = $lp3(Math.floor(A));
    return Result;
  };
  this.Ceil64 = function (A) {
    var Result = 0;
    Result = $lp3(Math.ceil(A));
    return Result;
  };
  this.Floor64 = function (A) {
    var Result = 0;
    Result = $lp3(Math.ceil(A));
    return Result;
  };
  this.ldexp = function (x, p) {
    var Result = 0.0;
    Result = x * $mod.IntPower(2.0,p);
    return Result;
  };
  this.Frexp = function (X, Mantissa, Exponent) {
    Exponent.set(0);
    if (X !== 0) if (Math.abs(X) < 0.5) {
      do {
        X = X * 2;
        Exponent.set(Exponent.get() - 1);
      } while (!(Math.abs(X) >= 0.5))}
     else while (Math.abs(X) >= 1) {
      X = X / 2;
      Exponent.set(Exponent.get() + 1);
    };
    Mantissa.set(X);
  };
  this.lnxp1 = function (x) {
    var Result = 0.0;
    var y = 0.0;
    if (x >= 4.0) {
      Result = Math.log(1.0 + x)}
     else {
      y = 1.0 + x;
      if (y === 1.0) {
        Result = x}
       else {
        Result = Math.log(y);
        if (y > 0.0) Result = Result + ((x - (y - 1.0)) / y);
      };
    };
    return Result;
  };
  this.IntPower = function (base, exponent) {
    var Result = 0.0;
    var i = 0;
    if ((base === 0.0) && (exponent === 0)) {
      Result = 1}
     else {
      i = Math.abs(exponent);
      Result = 1.0;
      while (i > 0) {
        while ((i & 1) === 0) {
          i = i >>> 1;
          base = $lp1(base);
        };
        i = i - 1;
        Result = Result * base;
      };
      if (exponent < 0) Result = 1.0 / Result;
    };
    return Result;
  };
  this.DivMod = function (Dividend, Divisor, Result, Remainder) {
    if (Dividend < 0) {
      Dividend = -Dividend;
      Result.set(-rtl.trunc(Dividend / Divisor));
      Remainder.set(-(Dividend + (Result.get() * Divisor)));
    } else {
      Result.set(rtl.trunc(Dividend / Divisor));
      Remainder.set(Dividend - (Result.get() * Divisor));
    };
  };
  this.DivMod$1 = function (Dividend, Divisor, Result, Remainder) {
    if (Dividend < 0) {
      Dividend = -Dividend;
      Result.set(-rtl.trunc(Dividend / Divisor));
      Remainder.set(-(Dividend + (Result.get() * Divisor)));
    } else {
      Result.set(rtl.trunc(Dividend / Divisor));
      Remainder.set(Dividend - (Result.get() * Divisor));
    };
  };
  this.DivMod$2 = function (Dividend, Divisor, Result, Remainder) {
    Result.set(rtl.trunc(Dividend / Divisor));
    Remainder.set(Dividend - (Result.get() * Divisor));
  };
  this.DivMod$3 = function (Dividend, Divisor, Result, Remainder) {
    if (Dividend < 0) {
      Dividend = -Dividend;
      Result.set(-rtl.trunc(Dividend / Divisor));
      Remainder.set(-(Dividend + (Result.get() * Divisor)));
    } else {
      Result.set(rtl.trunc(Dividend / Divisor));
      Remainder.set(Dividend - (Result.get() * Divisor));
    };
  };
  this.DegToRad = function (deg) {
    var Result = 0.0;
    Result = deg * (Math.PI / 180.0);
    return Result;
  };
  this.RadToDeg = function (rad) {
    var Result = 0.0;
    Result = rad * (180.0 / Math.PI);
    return Result;
  };
  this.GradToRad = function (grad) {
    var Result = 0.0;
    Result = grad * (Math.PI / 200.0);
    return Result;
  };
  this.RadToGrad = function (rad) {
    var Result = 0.0;
    Result = rad * (200.0 / Math.PI);
    return Result;
  };
  this.DegToGrad = function (deg) {
    var Result = 0.0;
    Result = deg * (200.0 / 180.0);
    return Result;
  };
  this.GradToDeg = function (grad) {
    var Result = 0.0;
    Result = grad * (180.0 / 200.0);
    return Result;
  };
  this.CycleToRad = function (cycle) {
    var Result = 0.0;
    Result = 2 * Math.PI * cycle;
    return Result;
  };
  this.RadToCycle = function (rad) {
    var Result = 0.0;
    Result = rad * (1 / (2 * Math.PI));
    return Result;
  };
  this.DegNormalize = function (deg) {
    var Result = 0.0;
    Result = deg - ($lp(deg / 360) * 360);
    if (Result < 0) Result = Result + 360;
    return Result;
  };
  this.Norm = function (data) {
    var Result = 0.0;
    Result = Math.sqrt($impl.sumofsquares(data));
    return Result;
  };
  this.Mean = function (data) {
    var Result = 0.0;
    var N = 0;
    N = rtl.length(data);
    if (N === 0) {
      Result = 0}
     else Result = $mod.Sum(data) / N;
    return Result;
  };
  this.Sum = function (data) {
    var Result = 0.0;
    var i = 0;
    var N = 0;
    N = rtl.length(data);
    Result = 0.0;
    for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
      i = $l;
      Result = Result + data[i];
    };
    return Result;
  };
  this.SumsAndSquares = function (data, Sum, SumOfSquares) {
    var i = 0;
    var n = 0;
    var t = 0.0;
    var s = 0.0;
    var ss = 0.0;
    n = rtl.length(data);
    ss = 0.0;
    s = 0.0;
    for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
      i = $l;
      t = data[i];
      ss = ss + $lp1(t);
      s = s + t;
    };
    Sum.set(s);
    SumOfSquares.set(ss);
  };
  this.StdDev = function (data) {
    var Result = 0.0;
    Result = Math.sqrt($mod.Variance(data));
    return Result;
  };
  this.MeanAndStdDev = function (data, Mean, StdDev) {
    var I = 0;
    var N = 0;
    var M = 0.0;
    var S = 0.0;
    N = rtl.length(data);
    M = 0;
    S = 0;
    for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
      I = $l;
      M = M + data[I];
      S = S + $lp1(data[I]);
    };
    M = M / N;
    S = S - (N * $lp1(M));
    if (N > 1) {
      S = Math.sqrt(S / (N - 1))}
     else S = 0;
    Mean.set(M);
    StdDev.set(S);
  };
  this.Variance = function (data) {
    var Result = 0.0;
    var n = 0;
    n = rtl.length(data);
    if (n === 1) {
      Result = 0}
     else Result = $mod.TotalVariance(data) / (n - 1);
    return Result;
  };
  this.TotalVariance = function (data) {
    var Result = 0.0;
    var S = 0.0;
    var SS = 0.0;
    var N = 0;
    N = rtl.length(data);
    if (rtl.length(data) === 1) {
      Result = 0}
     else {
      $mod.SumsAndSquares(data,{get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},{get: function () {
          return SS;
        }, set: function (v) {
          SS = v;
        }});
      Result = SS - ($lp1(S) / N);
    };
    return Result;
  };
  this.PopNStdDev = function (data) {
    var Result = 0.0;
    Result = Math.sqrt($mod.PopNVariance(data));
    return Result;
  };
  this.PopNVariance = function (data) {
    var Result = 0.0;
    var N = 0;
    N = rtl.length(data);
    if (N === 0) {
      Result = 0}
     else Result = $mod.TotalVariance(data) / N;
    return Result;
  };
  this.MomentSkewKurtosis = function (data, m1, m2, m3, m4, skew, kurtosis) {
    var i = 0;
    var N = 0;
    var deviation = 0.0;
    var deviation2 = 0.0;
    var reciprocalN = 0.0;
    var lm1 = 0.0;
    var lm2 = 0.0;
    var lm3 = 0.0;
    var lm4 = 0.0;
    var lskew = 0.0;
    var lkurtosis = 0.0;
    N = rtl.length(data);
    lm1 = 0;
    reciprocalN = 1 / N;
    for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
      i = $l;
      lm1 = lm1 + data[i];
    };
    lm1 = reciprocalN * lm1;
    lm2 = 0;
    lm3 = 0;
    lm4 = 0;
    for (var $l1 = 0, $end1 = N - 1; $l1 <= $end1; $l1++) {
      i = $l1;
      deviation = data[i] - lm1;
      deviation2 = deviation * deviation;
      lm2 = lm2 + deviation2;
      lm3 = lm3 + (deviation2 * deviation);
      lm4 = lm4 + (deviation2 * deviation2);
    };
    lm2 = reciprocalN * lm2;
    lm3 = reciprocalN * lm3;
    lm4 = reciprocalN * lm4;
    lskew = lm3 / (Math.sqrt(lm2) * lm2);
    lkurtosis = lm4 / (lm2 * lm2);
    m1.set(lm1);
    m2.set(lm2);
    m3.set(lm3);
    m4.set(lm4);
    skew.set(lskew);
    kurtosis.set(lkurtosis);
  };
  this.MaxIntValue = function (AData) {
    var Result = 0;
    var lCount = 0;
    Result = AData[0];
    for (var $l = 1, $end = rtl.length(AData) - 1; $l <= $end; $l++) {
      lCount = $l;
      if (Result < AData[lCount]) Result = AData[lCount];
    };
    return Result;
  };
  $lt = this.TPaymentTime = {"0": "ptEndOfPeriod", ptEndOfPeriod: 0, "1": "ptStartOfPeriod", ptStartOfPeriod: 1};
  this.$rtti.$Enum("TPaymentTime",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TPaymentTime});
  this.FutureValue = function (ARate, NPeriods, APayment, APresentValue, APaymentTime) {
    var Result = 0.0;
    var q = 0.0;
    var qn = 0.0;
    var factor = 0.0;
    if (ARate === 0) {
      Result = -APresentValue - (APayment * NPeriods)}
     else {
      q = 1.0 + ARate;
      qn = Math.pow(q,NPeriods);
      factor = (qn - 1) / (q - 1);
      if (APaymentTime === 1) factor = factor * q;
      Result = -((APresentValue * qn) + (APayment * factor));
    };
    return Result;
  };
  var DELTA = 0.001;
  var EPS = 1E-9;
  var MAXIT = 20;
  this.InterestRate = function (NPeriods, APayment, APresentValue, AFutureValue, APaymentTime) {
    var Result = 0.0;
    var r1 = 0.0;
    var r2 = 0.0;
    var dr = 0.0;
    var fv1 = 0.0;
    var fv2 = 0.0;
    var iteration = 0;
    iteration = 0;
    r1 = 0.05;
    do {
      r2 = r1 + 1E-3;
      fv1 = $mod.FutureValue(r1,NPeriods,APayment,APresentValue,APaymentTime);
      fv2 = $mod.FutureValue(r2,NPeriods,APayment,APresentValue,APaymentTime);
      dr = ((AFutureValue - fv1) / (fv2 - fv1)) * 1E-3;
      r1 = r1 + dr;
      iteration += 1;
    } while (!((Math.abs(dr) < 1E-9) || (iteration >= 20)));
    Result = r1;
    return Result;
  };
  this.NumberOfPeriods = function (ARate, APayment, APresentValue, AFutureValue, APaymentTime) {
    var Result = 0.0;
    var q = 0.0;
    var x1 = 0.0;
    var x2 = 0.0;
    if (ARate === 0) {
      Result = -(APresentValue + AFutureValue) / APayment}
     else {
      q = 1.0 + ARate;
      if (APaymentTime === 1) APayment = APayment * q;
      x1 = APayment - (AFutureValue * ARate);
      x2 = APayment + (APresentValue * ARate);
      if ((x2 === 0) || ((Math.sign(x1) * Math.sign(x2)) < 0)) {
        Result = Infinity}
       else {
        Result = Math.log(x1 / x2) / Math.log(q);
      };
    };
    return Result;
  };
  this.Payment = function (ARate, NPeriods, APresentValue, AFutureValue, APaymentTime) {
    var Result = 0.0;
    var q = 0.0;
    var qn = 0.0;
    var factor = 0.0;
    if (ARate === 0) {
      Result = -(AFutureValue + APresentValue) / NPeriods}
     else {
      q = 1.0 + ARate;
      qn = Math.pow(q,NPeriods);
      factor = (qn - 1) / (q - 1);
      if (APaymentTime === 1) factor = factor * q;
      Result = -(AFutureValue + (APresentValue * qn)) / factor;
    };
    return Result;
  };
  this.PresentValue = function (ARate, NPeriods, APayment, AFutureValue, APaymentTime) {
    var Result = 0.0;
    var q = 0.0;
    var qn = 0.0;
    var factor = 0.0;
    if (ARate === 0.0) {
      Result = -AFutureValue - (APayment * NPeriods)}
     else {
      q = 1.0 + ARate;
      qn = Math.pow(q,NPeriods);
      factor = (qn - 1) / (q - 1);
      if (APaymentTime === 1) factor = factor * q;
      Result = -(AFutureValue + (APayment * factor)) / qn;
    };
    return Result;
  };
  this.IfThen = function (val, ifTrue, ifFalse) {
    var Result = 0;
    if (val) {
      Result = ifTrue}
     else Result = ifFalse;
    return Result;
  };
  this.IfThen$1 = function (val, ifTrue, ifFalse) {
    var Result = 0.0;
    if (val) {
      Result = ifTrue}
     else Result = ifFalse;
    return Result;
  };
  this.$rtti.$Int("TValueRelationship",{minvalue: -1, maxvalue: 1, ordtype: 0});
  this.EqualsValue = 0;
  this.LessThanValue = -1;
  this.GreaterThanValue = 1;
  this.CompareValue = function (A, B) {
    var Result = 0;
    Result = 1;
    if (A === B) {
      Result = 0}
     else if (A < B) Result = -1;
    return Result;
  };
  this.CompareValue$1 = function (A, B) {
    var Result = 0;
    Result = 1;
    if (A === B) {
      Result = 0}
     else if (A < B) Result = -1;
    return Result;
  };
  this.CompareValue$2 = function (A, B) {
    var Result = 0;
    Result = 1;
    if (A === B) {
      Result = 0}
     else if (A < B) Result = -1;
    return Result;
  };
  this.CompareValue$3 = function (A, B, delta) {
    var Result = 0;
    Result = 1;
    if (Math.abs(A - B) <= delta) {
      Result = 0}
     else if (A < B) Result = -1;
    return Result;
  };
  $mod.$implcode = function () {
    $impl.DZeroResolution = 1E-12;
    $impl.sumofsquares = function (data) {
      var Result = 0.0;
      var i = 0;
      var N = 0;
      N = rtl.length(data);
      Result = 0.0;
      for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
        i = $l;
        Result = Result + $lp1(data[i]);
      };
      return Result;
    };
  };
},[]);
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  var $lt = null;
  var $lt1 = null;
  var $lt2 = null;
  var $lt3 = null;
  var $lt4 = null;
  var $lt5 = null;
  var $lt6 = null;
  var $lt7 = null;
  var $lt8 = null;
  var $lt9 = null;
  var $lt10 = null;
  var $lt11 = null;
  var $lm = pas.System;
  var $lp = $lm.Sqr;
  var $lp1 = $lm.Sqr$1;
  var $lp2 = $lm.Trunc;
  var $lm1 = null;
  var $lp3 = null;
  var $lp4 = null;
  var $lp5 = null;
  var $lp6 = null;
  var $lp7 = null;
  var $lp8 = null;
  var $lp9 = $lm.Delete;
  this.Epsilon = 1E-40;
  this.Epsilon2 = 1E-30;
  this.cPI = 3.141592654;
  this.cPIdiv180 = 0.017453292;
  this.cPIdiv2 = 1.570796326;
  this.cPIdiv4 = 0.785398163;
  $lt = this.TDirection = {"0": "FromBeginning", FromBeginning: 0, "1": "FromEnd", FromEnd: 1};
  this.$rtti.$Enum("TDirection",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TDirection});
  this.$rtti.$DynArray("TBooleanDynArray",{eltype: rtl.boolean});
  this.$rtti.$DynArray("TWordDynArray",{eltype: rtl.word});
  this.$rtti.$DynArray("TIntegerDynArray",{eltype: rtl.longint});
  this.$rtti.$DynArray("TNativeIntDynArray",{eltype: rtl.nativeint});
  this.$rtti.$DynArray("TStringDynArray",{eltype: rtl.string});
  this.$rtti.$DynArray("TDoubleDynArray",{eltype: rtl.double});
  this.$rtti.$DynArray("TJSValueDynArray",{eltype: rtl.jsvalue});
  this.$rtti.$DynArray("TObjectDynArray",{eltype: $lm.$rtti["TObject"]});
  this.$rtti.$DynArray("TByteDynArray",{eltype: rtl.byte});
  $lt1 = this.TSplitRectType = {"0": "srLeft", srLeft: 0, "1": "srRight", srRight: 1, "2": "srTop", srTop: 2, "3": "srBottom", srBottom: 3};
  this.$rtti.$Enum("TSplitRectType",{minvalue: 0, maxvalue: 3, ordtype: 1, enumtype: this.TSplitRectType});
  $lt2 = this.TDuplicates = {"0": "dupIgnore", dupIgnore: 0, "1": "dupAccept", dupAccept: 1, "2": "dupError", dupError: 2};
  this.$rtti.$Enum("TDuplicates",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TDuplicates});
  this.$rtti.$RefToProcVar("TProc",{procsig: rtl.newTIProcSig([])});
  this.$rtti.$RefToProcVar("TProcString",{procsig: rtl.newTIProcSig([["aString",rtl.string,2]])});
  this.$rtti.$MethodVar("TListCallback",{procsig: rtl.newTIProcSig([["data",rtl.jsvalue],["arg",rtl.jsvalue]]), methodkind: 0});
  this.$rtti.$ProcVar("TListStaticCallback",{procsig: rtl.newTIProcSig([["data",rtl.jsvalue],["arg",rtl.jsvalue]])});
  rtl.recNewT(this,"TSize",function () {
    $lt3 = this;
    this.cx = 0;
    this.cy = 0;
    this.$eq = function (b) {
      return (this.cx === b.cx) && (this.cy === b.cy);
    };
    this.$assign = function (s) {
      this.cx = s.cx;
      this.cy = s.cy;
      return this;
    };
    this.Create = function (ax, ay) {
      this.cx = ax;
      this.cy = ay;
      return this;
    };
    this.Create$1 = function (asz) {
      this.cx = asz.cx;
      this.cy = asz.cy;
      return this;
    };
    this.Add = function (asz) {
      var Result = $lt3.$new();
      Result.cx = this.cx + asz.cx;
      Result.cy = this.cy + asz.cy;
      return Result;
    };
    this.Distance = function (asz) {
      var Result = 0.0;
      Result = Math.sqrt($lp(this.cx - asz.cx) + $lp(this.cy - asz.cy));
      return Result;
    };
    this.IsZero = function () {
      var Result = false;
      Result = (this.cx === 0) && (this.cy === 0);
      return Result;
    };
    this.Subtract = function (asz) {
      var Result = $lt3.$new();
      Result.cx = this.cx - asz.cx;
      Result.cy = this.cy - asz.cy;
      return Result;
    };
    var $r = $mod.$rtti.$Record("TSize",{},this);
    $r.addField("cx",rtl.longint);
    $r.addField("cy",rtl.longint);
    $r.addMethod("Create",2,[["ax",rtl.longint],["ay",rtl.longint]]);
    $r.addMethod("Create$1",2,[["asz",$r]]);
    $r.addMethod("Add",1,[["asz",$r,2]],2,$r);
    $r.addMethod("Distance",1,[["asz",$r,2]],2,rtl.double);
    $r.addMethod("IsZero",1,[],2,rtl.boolean);
    $r.addMethod("Subtract",1,[["asz",$r,2]],2,$r);
    $r.addProperty("Width",0,rtl.longint,"cx","cx",2);
    $r.addProperty("Height",0,rtl.longint,"cy","cy",2);
  });
  rtl.recNewT(this,"TPoint",function () {
    $lt4 = this;
    this.X = 0;
    this.Y = 0;
    this.$eq = function (b) {
      return (this.X === b.X) && (this.Y === b.Y);
    };
    this.$assign = function (s) {
      this.X = s.X;
      this.Y = s.Y;
      return this;
    };
    this.Zero = function () {
      var Result = $lt4.$new();
      Result.X = 0;
      Result.Y = 0;
      return Result;
    };
    this.Add = function (apt) {
      var Result = $lt4.$new();
      Result.X = this.X + apt.X;
      Result.Y = this.Y + apt.Y;
      return Result;
    };
    this.Distance = function (apt) {
      var Result = 0.0;
      Result = Math.sqrt($lp1(apt.X - this.X) + $lp1(apt.Y - this.Y));
      return Result;
    };
    this.IsZero = function () {
      var Result = false;
      Result = (this.X === 0) && (this.Y === 0);
      return Result;
    };
    this.Subtract = function (apt) {
      var Result = $lt4.$new();
      Result.X = this.X - apt.X;
      Result.Y = this.Y - apt.Y;
      return Result;
    };
    this.SetLocation = function (apt) {
      this.X = apt.X;
      this.Y = apt.Y;
    };
    this.SetLocation$1 = function (ax, ay) {
      this.X = ax;
      this.Y = ay;
    };
    this.Offset = function (apt) {
      this.X = this.X + apt.X;
      this.Y = this.Y + apt.Y;
    };
    this.Offset$1 = function (dx, dy) {
      this.X = this.X + dx;
      this.Y = this.Y + dy;
    };
    this.Angle = function (pt) {
      var $Self = this;
      var Result = 0.0;
      function arctan2(y, x) {
        var Result = 0.0;
        if (x === 0) {
          if (y === 0) {
            Result = 0.0}
           else if (y > 0) {
            Result = Math.PI / 2}
           else Result = -Math.PI / 2;
        } else {
          Result = Math.atan(y / x);
          if (x < 0) if (y < 0) {
            Result = Result - Math.PI}
           else Result = Result + Math.PI;
        };
        return Result;
      };
      Result = arctan2(this.Y - pt.Y,this.X - pt.X);
      return Result;
    };
    this.PointInCircle = function (apt, acenter, aradius) {
      var Result = false;
      Result = apt.Distance(acenter) <= aradius;
      return Result;
    };
    var $r = $mod.$rtti.$Record("TPoint",{},this);
    $r.addField("X",rtl.longint);
    $r.addField("Y",rtl.longint);
    $r.addMethod("Zero",5,[],2,$r,1);
    $r.addMethod("Add",1,[["apt",$r,2]],2,$r);
    $r.addMethod("Distance",1,[["apt",$r,2]],2,rtl.double);
    $r.addMethod("IsZero",1,[],2,rtl.boolean);
    $r.addMethod("Subtract",1,[["apt",$r,2]],2,$r);
    $r.addMethod("SetLocation",0,[["apt",$r,2]]);
    $r.addMethod("SetLocation$1",0,[["ax",rtl.longint],["ay",rtl.longint]]);
    $r.addMethod("Offset",0,[["apt",$r,2]]);
    $r.addMethod("Offset$1",0,[["dx",rtl.longint],["dy",rtl.longint]]);
    $r.addMethod("Angle",1,[["pt",$r,2]],2,rtl.double);
    $r.addMethod("PointInCircle",5,[["apt",$r,2],["acenter",$r,2],["aradius",rtl.longint,2]],2,rtl.boolean,1);
  });
  this.$rtti.$Pointer("PPoint",{reftype: this.$rtti["TPoint"]});
  rtl.recNewT(this,"TRect",function () {
    $lt5 = this;
    this.Left = 0;
    this.Top = 0;
    this.Right = 0;
    this.Bottom = 0;
    this.$eq = function (b) {
      return (this.Left === b.Left) && (this.Top === b.Top) && (this.Right === b.Right) && (this.Bottom === b.Bottom);
    };
    this.$assign = function (s) {
      this.Left = s.Left;
      this.Top = s.Top;
      this.Right = s.Right;
      this.Bottom = s.Bottom;
      return this;
    };
    this.GetBottomRight = function () {
      var Result = $lt4.$new();
      Result.$assign($mod.Point(this.Right,this.Bottom));
      return Result;
    };
    this.getHeight = function () {
      var Result = 0;
      Result = this.Bottom - this.Top;
      return Result;
    };
    this.getLocation = function () {
      var Result = $lt4.$new();
      Result.X = this.Left;
      Result.Y = this.Top;
      return Result;
    };
    this.getSize = function () {
      var Result = $lt3.$new();
      Result.cx = this.getWidth();
      Result.cy = this.getHeight();
      return Result;
    };
    this.GetTopLeft = function () {
      var Result = $lt4.$new();
      Result.$assign($mod.Point(this.Left,this.Top));
      return Result;
    };
    this.getWidth = function () {
      var Result = 0;
      Result = this.Right - this.Left;
      return Result;
    };
    this.SetBottomRight = function (aValue) {
      this.Bottom = aValue.Y;
      this.Right = aValue.X;
    };
    this.setHeight = function (AValue) {
      this.Bottom = this.Top + AValue;
    };
    this.setSize = function (AValue) {
      this.Bottom = this.Top + AValue.cy;
      this.Right = this.Left + AValue.cx;
    };
    this.SetTopLeft = function (aValue) {
      this.Top = aValue.Y;
      this.Left = aValue.X;
    };
    this.setWidth = function (AValue) {
      this.Right = this.Left + AValue;
    };
    this.Create = function (Origin) {
      this.SetTopLeft(Origin);
      this.SetBottomRight(Origin);
      return this;
    };
    this.Create$1 = function (Origin, AWidth, AHeight) {
      this.SetTopLeft(Origin);
      this.setWidth(AWidth);
      this.setHeight(AHeight);
      return this;
    };
    this.Create$2 = function (ALeft, ATop, ARight, ABottom) {
      this.Left = ALeft;
      this.Top = ATop;
      this.Right = ARight;
      this.Bottom = ABottom;
      return this;
    };
    this.Create$3 = function (P1, P2, Normalize) {
      this.SetTopLeft(P1);
      this.SetBottomRight(P2);
      if (Normalize) this.NormalizeRect();
      return this;
    };
    this.Create$4 = function (R, Normalize) {
      this.$assign(R);
      if (Normalize) this.NormalizeRect();
      return this;
    };
    this.Empty = function () {
      var Result = $lt5.$new();
      Result.$assign($lt5.$new().Create$2(0,0,0,0));
      return Result;
    };
    this.NormalizeRect = function () {
      var x = 0;
      if (this.Top > this.Bottom) {
        x = this.Top;
        this.Top = this.Bottom;
        this.Bottom = x;
      };
      if (this.Left > this.Right) {
        x = this.Left;
        this.Left = this.Right;
        this.Right = x;
      };
    };
    this.IsEmpty = function () {
      var Result = false;
      Result = (this.Right <= this.Left) || (this.Bottom <= this.Top);
      return Result;
    };
    this.Contains = function (Pt) {
      var Result = false;
      Result = (this.Left <= Pt.X) && (Pt.X < this.Right) && (this.Top <= Pt.Y) && (Pt.Y < this.Bottom);
      return Result;
    };
    this.Contains$1 = function (R) {
      var Result = false;
      Result = (this.Left <= R.Left) && (R.Right <= this.Right) && (this.Top <= R.Top) && (R.Bottom <= this.Bottom);
      return Result;
    };
    this.IntersectsWith = function (R) {
      var Result = false;
      Result = (this.Left < R.Right) && (R.Left < this.Right) && (this.Top < R.Bottom) && (R.Top < this.Bottom);
      return Result;
    };
    this.Intersect = function (R1, R2) {
      var Result = $lt5.$new();
      $mod.IntersectRect(Result,R1,R2);
      return Result;
    };
    this.Intersect$1 = function (R) {
      this.$assign($lt5.Intersect($lt5.$clone(this),$lt5.$clone(R)));
    };
    this.Union = function (R1, R2) {
      var Result = $lt5.$new();
      $mod.UnionRect(Result,R1,R2);
      return Result;
    };
    this.Union$1 = function (R) {
      this.$assign($lt5.Union($lt5.$clone(this),$lt5.$clone(R)));
    };
    this.Union$2 = function (Points) {
      var Result = $lt5.$new();
      var i = 0;
      if (rtl.length(Points) > 0) {
        Result.SetTopLeft(Points[0]);
        Result.SetBottomRight(Points[0]);
        for (var $l = 1, $end = rtl.length(Points) - 1; $l <= $end; $l++) {
          i = $l;
          if (Points[i].X < Result.Left) Result.Left = Points[i].X;
          if (Points[i].X > Result.Right) Result.Right = Points[i].X;
          if (Points[i].Y < Result.Top) Result.Top = Points[i].Y;
          if (Points[i].Y > Result.Bottom) Result.Bottom = Points[i].Y;
        };
      } else Result.$assign($lt5.Empty());
      return Result;
    };
    this.Offset = function (DX, DY) {
      $mod.OffsetRect(this,DX,DY);
    };
    this.Offset$1 = function (DP) {
      $mod.OffsetRect(this,DP.X,DP.Y);
    };
    this.SetLocation = function (X, Y) {
      this.Offset(X - this.Left,Y - this.Top);
    };
    this.SetLocation$1 = function (P) {
      this.SetLocation(P.X,P.Y);
    };
    this.Inflate = function (DX, DY) {
      $mod.InflateRect(this,DX,DY);
    };
    this.Inflate$1 = function (DL, DT, DR, DB) {
      this.Left -= DL;
      this.Top -= DT;
      this.Right += DR;
      this.Bottom += DB;
    };
    this.CenterPoint = function () {
      var Result = $lt4.$new();
      Result.X = rtl.trunc((this.Right - this.Left) / 2) + this.Left;
      Result.Y = rtl.trunc((this.Bottom - this.Top) / 2) + this.Top;
      return Result;
    };
    this.SplitRect = function (SplitType, ASize) {
      var Result = $lt5.$new();
      Result.$assign(this);
      var $tmp = SplitType;
      if ($tmp === 0) {
        Result.Right = this.Left + ASize}
       else if ($tmp === 1) {
        Result.Left = this.Right - ASize}
       else if ($tmp === 2) {
        Result.Bottom = this.Top + ASize}
       else if ($tmp === 3) Result.Top = this.Bottom - ASize;
      return Result;
    };
    this.SplitRect$1 = function (SplitType, Percent) {
      var Result = $lt5.$new();
      Result.$assign(this);
      var $tmp = SplitType;
      if ($tmp === 0) {
        Result.Right = this.Left + $lp2(Percent * this.getWidth())}
       else if ($tmp === 1) {
        Result.Left = this.Right - $lp2(Percent * this.getWidth())}
       else if ($tmp === 2) {
        Result.Bottom = this.Top + $lp2(Percent * this.getHeight())}
       else if ($tmp === 3) Result.Top = this.Bottom - $lp2(Percent * this.getHeight());
      return Result;
    };
    var $r = $mod.$rtti.$Record("TRect",{},this);
    $r.addMethod("Create",2,[["Origin",$mod.$rtti["TPoint"]]]);
    $r.addMethod("Create$1",2,[["Origin",$mod.$rtti["TPoint"]],["AWidth",rtl.longint],["AHeight",rtl.longint]]);
    $r.addMethod("Create$2",2,[["ALeft",rtl.longint],["ATop",rtl.longint],["ARight",rtl.longint],["ABottom",rtl.longint]]);
    $r.addMethod("Create$3",2,[["P1",$mod.$rtti["TPoint"]],["P2",$mod.$rtti["TPoint"]],["Normalize",rtl.boolean]]);
    $r.addMethod("Create$4",2,[["R",$r],["Normalize",rtl.boolean]]);
    $r.addMethod("Empty",5,[],2,$r,1);
    $r.addMethod("NormalizeRect",0,[]);
    $r.addMethod("IsEmpty",1,[],2,rtl.boolean);
    $r.addMethod("Contains",1,[["Pt",$mod.$rtti["TPoint"]]],2,rtl.boolean);
    $r.addMethod("Contains$1",1,[["R",$r]],2,rtl.boolean);
    $r.addMethod("IntersectsWith",1,[["R",$r]],2,rtl.boolean);
    $r.addMethod("Intersect",5,[["R1",$r],["R2",$r]],2,$r,1);
    $r.addMethod("Intersect$1",0,[["R",$r]]);
    $r.addMethod("Union",5,[["R1",$r],["R2",$r]],2,$r,1);
    $r.addMethod("Union$1",0,[["R",$r]]);
    $r.addMethod("Union$2",5,[["Points",$mod.$rtti["TPoint"],10]],2,$r,1);
    $r.addMethod("Offset",0,[["DX",rtl.longint],["DY",rtl.longint]]);
    $r.addMethod("Offset$1",0,[["DP",$mod.$rtti["TPoint"]]]);
    $r.addMethod("SetLocation",0,[["X",rtl.longint],["Y",rtl.longint]]);
    $r.addMethod("SetLocation$1",0,[["P",$mod.$rtti["TPoint"]]]);
    $r.addMethod("Inflate",0,[["DX",rtl.longint],["DY",rtl.longint]]);
    $r.addMethod("Inflate$1",0,[["DL",rtl.longint],["DT",rtl.longint],["DR",rtl.longint],["DB",rtl.longint]]);
    $r.addMethod("CenterPoint",1,[],2,$mod.$rtti["TPoint"]);
    $r.addMethod("SplitRect",1,[["SplitType",$mod.$rtti["TSplitRectType"]],["ASize",rtl.longint]],2,$r);
    $r.addMethod("SplitRect$1",1,[["SplitType",$mod.$rtti["TSplitRectType"]],["Percent",rtl.double]],2,$r);
    $r.addField("Left",rtl.longint);
    $r.addField("Top",rtl.longint);
    $r.addField("Right",rtl.longint);
    $r.addField("Bottom",rtl.longint);
    $r.addProperty("Height",3,rtl.longint,"getHeight","setHeight",2);
    $r.addProperty("Width",3,rtl.longint,"getWidth","setWidth",2);
    $r.addProperty("Size",3,$mod.$rtti["TSize"],"getSize","setSize",2);
    $r.addProperty("Location",3,$mod.$rtti["TPoint"],"getLocation","SetLocation$1",2);
    $r.addProperty("TopLeft",3,$mod.$rtti["TPoint"],"GetTopLeft","SetTopLeft",2);
    $r.addProperty("BottomRight",3,$mod.$rtti["TPoint"],"GetBottomRight","SetBottomRight",2);
  });
  this.$rtti.$Pointer("PRect",{reftype: this.$rtti["TRect"]});
  this.$rtti.$Pointer("PPointF",{reftype: this.$rtti["TPointF"]});
  rtl.recNewT(this,"TPointF",function () {
    $lt6 = this;
    this.x = 0.0;
    this.y = 0.0;
    this.$eq = function (b) {
      return (this.x === b.x) && (this.y === b.y);
    };
    this.$assign = function (s) {
      this.x = s.x;
      this.y = s.y;
      return this;
    };
    this.Add = function (apt) {
      var Result = $lt6.$new();
      Result.x = this.x + apt.X;
      Result.y = this.y + apt.Y;
      return Result;
    };
    this.Add$1 = function (apt) {
      var Result = $lt6.$new();
      Result.x = this.x + apt.x;
      Result.y = this.y + apt.y;
      return Result;
    };
    this.Distance = function (apt) {
      var Result = 0.0;
      Result = Math.sqrt($lp1(apt.x - this.x) + $lp1(apt.y - this.y));
      return Result;
    };
    this.DotProduct = function (apt) {
      var Result = 0.0;
      Result = (this.x * apt.x) + (this.y * apt.y);
      return Result;
    };
    this.IsZero = function () {
      var Result = false;
      Result = $lp3(this.x,0.0,0.0) && $lp3(this.y,0.0,0.0);
      return Result;
    };
    this.Subtract = function (apt) {
      var Result = $lt6.$new();
      Result.x = this.x - apt.x;
      Result.y = this.y - apt.y;
      return Result;
    };
    this.Subtract$1 = function (apt) {
      var Result = $lt6.$new();
      Result.x = this.x - apt.X;
      Result.y = this.y - apt.Y;
      return Result;
    };
    this.SetLocation = function (apt) {
      this.x = apt.x;
      this.y = apt.y;
    };
    this.SetLocation$1 = function (apt) {
      this.x = apt.X;
      this.y = apt.Y;
    };
    this.SetLocation$2 = function (ax, ay) {
      this.x = ax;
      this.y = ay;
    };
    this.Offset = function (apt) {
      this.x = this.x + apt.x;
      this.y = this.y + apt.y;
    };
    this.Offset$1 = function (apt) {
      this.x = this.x + apt.X;
      this.y = this.y + apt.Y;
    };
    this.Offset$2 = function (dx, dy) {
      this.x = this.x + dx;
      this.y = this.y + dy;
    };
    this.EqualsTo = function (apt, aEpsilon) {
      var $Self = this;
      var Result = false;
      function Eq(a, b) {
        var Result = false;
        Result = Math.abs(a - b) <= aEpsilon;
        return Result;
      };
      Result = Eq(this.x,apt.x) && Eq(this.y,apt.y);
      return Result;
    };
    this.EqualsTo$1 = function (apt) {
      var Result = false;
      Result = this.EqualsTo(apt,0);
      return Result;
    };
    this.Scale = function (afactor) {
      var Result = $lt6.$new();
      Result.x = afactor * this.x;
      Result.y = afactor * this.y;
      return Result;
    };
    this.Ceiling = function () {
      var Result = $lt4.$new();
      Result.X = $lp4(this.x);
      Result.Y = $lp4(this.y);
      return Result;
    };
    this.Truncate = function () {
      var Result = $lt4.$new();
      Result.X = $lp2(this.x);
      Result.Y = $lp2(this.y);
      return Result;
    };
    this.Floor = function () {
      var Result = $lt4.$new();
      Result.X = $lp5(this.x);
      Result.Y = $lp5(this.y);
      return Result;
    };
    this.Round = function () {
      var Result = $lt4.$new();
      Result.X = Math.round(this.x);
      Result.Y = Math.round(this.y);
      return Result;
    };
    this.Length = function () {
      var Result = 0.0;
      Result = Math.sqrt($lp1(this.x) + $lp1(this.y));
      return Result;
    };
    this.Rotate = function (angle) {
      var Result = $lt6.$new();
      var sina = 0.0;
      var cosa = 0.0;
      $lp6(angle,{get: function () {
          return sina;
        }, set: function (v) {
          sina = v;
        }},{get: function () {
          return cosa;
        }, set: function (v) {
          cosa = v;
        }});
      Result.x = (this.x * cosa) - (this.y * sina);
      Result.y = (this.x * sina) + (this.y * cosa);
      return Result;
    };
    this.Reflect = function (normal) {
      var Result = $lt6.$new();
      var lCross = 0.0;
      var lTmp = $lt6.$new();
      lCross = (this.x * normal.x) + (this.y * normal.y);
      lCross = lCross * -2;
      lTmp.x = normal.x * lCross;
      lTmp.y = normal.y * lCross;
      Result.x = this.x + lTmp.x;
      Result.y = this.y + lTmp.y;
      return Result;
    };
    this.MidPoint = function (b) {
      var Result = $lt6.$new();
      Result.x = 0.5 * (this.x + b.x);
      Result.y = 0.5 * (this.y + b.y);
      return Result;
    };
    this.PointInCircle = function (pt, center, radius) {
      var Result = false;
      Result = ($lp1(center.x - pt.x) + $lp1(center.y - pt.y)) < $lp1(radius);
      return Result;
    };
    this.PointInCircle$1 = function (pt, center, radius) {
      var Result = false;
      Result = ($lp1(center.x - pt.x) + $lp1(center.y - pt.y)) < $lp1(radius);
      return Result;
    };
    this.Zero = function () {
      var Result = $lt6.$new();
      Result.x = 0;
      Result.y = 0;
      return Result;
    };
    this.Angle = function (b) {
      var Result = 0.0;
      Result = Math.atan2(this.y - b.y,this.x - b.x);
      return Result;
    };
    this.AngleCosine = function (b) {
      var Result = 0.0;
      var lCross = 0.0;
      lCross = (this.x * b.x) + (this.y * b.y);
      Result = $lp7(lCross / Math.sqrt(($lp1(this.x) + $lp1(this.y)) * ($lp1(b.x) + $lp1(b.y))),-1,1);
      return Result;
    };
    this.CrossProduct = function (apt) {
      var Result = 0.0;
      Result = (this.x * apt.y) - (this.y * apt.x);
      return Result;
    };
    this.Normalize = function () {
      var Result = $lt6.$new();
      var L = 0.0;
      L = Math.sqrt($lp1(this.x) + $lp1(this.y));
      if ($lp3(L,0,1.1E-10)) {
        Result.$assign(this)}
       else {
        Result.x = this.x / L;
        Result.y = this.y / L;
      };
      return Result;
    };
    this.ToString = function (aSize, aDecimals) {
      var Result = "";
      var Sx = "";
      var Sy = "";
      Sx = $impl.SingleToStr(this.x,aSize,aDecimals);
      Sy = $impl.SingleToStr(this.y,aSize,aDecimals);
      Result = "(" + Sx + "," + Sy + ")";
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = this.ToString(8,2);
      return Result;
    };
    this.Create = function (ax, ay) {
      var Result = $lt6.$new();
      Result.x = ax;
      Result.y = ay;
      return Result;
    };
    this.Create$1 = function (apt) {
      var Result = $lt6.$new();
      Result.x = apt.X;
      Result.y = apt.Y;
      return Result;
    };
    var $r = $mod.$rtti.$Record("TPointF",{},this);
    $r.addField("x",rtl.double);
    $r.addField("y",rtl.double);
    $r.addMethod("Add",1,[["apt",$mod.$rtti["TPoint"],2]],2,$r);
    $r.addMethod("Add$1",1,[["apt",$r,2]],2,$r);
    $r.addMethod("Distance",1,[["apt",$r,2]],2,rtl.double);
    $r.addMethod("DotProduct",1,[["apt",$r,2]],2,rtl.double);
    $r.addMethod("IsZero",1,[],2,rtl.boolean);
    $r.addMethod("Subtract",1,[["apt",$r,2]],2,$r);
    $r.addMethod("Subtract$1",1,[["apt",$mod.$rtti["TPoint"],2]],2,$r);
    $r.addMethod("SetLocation",0,[["apt",$r,2]]);
    $r.addMethod("SetLocation$1",0,[["apt",$mod.$rtti["TPoint"],2]]);
    $r.addMethod("SetLocation$2",0,[["ax",rtl.double],["ay",rtl.double]]);
    $r.addMethod("Offset",0,[["apt",$r,2]]);
    $r.addMethod("Offset$1",0,[["apt",$mod.$rtti["TPoint"],2]]);
    $r.addMethod("Offset$2",0,[["dx",rtl.double],["dy",rtl.double]]);
    $r.addMethod("EqualsTo",1,[["apt",$r,2],["aEpsilon",rtl.double,2]],2,rtl.boolean);
    $r.addMethod("EqualsTo$1",1,[["apt",$r,2]],2,rtl.boolean);
    $r.addMethod("Scale",1,[["afactor",rtl.double]],2,$r);
    $r.addMethod("Ceiling",1,[],2,$mod.$rtti["TPoint"]);
    $r.addMethod("Truncate",1,[],2,$mod.$rtti["TPoint"]);
    $r.addMethod("Floor",1,[],2,$mod.$rtti["TPoint"]);
    $r.addMethod("Round",1,[],2,$mod.$rtti["TPoint"]);
    $r.addMethod("Length",1,[],2,rtl.double);
    $r.addMethod("Rotate",1,[["angle",rtl.double]],2,$r);
    $r.addMethod("Reflect",1,[["normal",$r,2]],2,$r);
    $r.addMethod("MidPoint",1,[["b",$r,2]],2,$r);
    $r.addMethod("PointInCircle",5,[["pt",$r,2],["center",$r,2],["radius",rtl.double]],2,rtl.boolean,1);
    $r.addMethod("PointInCircle$1",5,[["pt",$r,2],["center",$r,2],["radius",rtl.longint]],2,rtl.boolean,1);
    $r.addMethod("Zero",5,[],2,$r,1);
    $r.addMethod("Angle",1,[["b",$r,2]],2,rtl.double);
    $r.addMethod("AngleCosine",1,[["b",$r,2]],2,rtl.double);
    $r.addMethod("CrossProduct",1,[["apt",$r,2]],2,rtl.double);
    $r.addMethod("Normalize",1,[],2,$r);
    $r.addMethod("ToString",1,[["aSize",rtl.byte],["aDecimals",rtl.byte]],2,rtl.string);
    $r.addMethod("ToString$1",1,[],2,rtl.string);
    $r.addMethod("Create",5,[["ax",rtl.double,2],["ay",rtl.double,2]],2,$r,1);
    $r.addMethod("Create$1",5,[["apt",$mod.$rtti["TPoint"],2]],2,$r,1);
  });
  this.$rtti.$Pointer("PSizeF",{reftype: this.$rtti["TSizeF"]});
  rtl.recNewT(this,"TSizeF",function () {
    $lt7 = this;
    this.cx = 0.0;
    this.cy = 0.0;
    this.$eq = function (b) {
      return (this.cx === b.cx) && (this.cy === b.cy);
    };
    this.$assign = function (s) {
      this.cx = s.cx;
      this.cy = s.cy;
      return this;
    };
    this.Add = function (asz) {
      var Result = $lt7.$new();
      Result.cx = this.cx + asz.cx;
      Result.cy = this.cy + asz.cy;
      return Result;
    };
    this.Add$1 = function (asz) {
      var Result = $lt7.$new();
      Result.cx = this.cx + asz.cx;
      Result.cy = this.cy + asz.cy;
      return Result;
    };
    this.Distance = function (asz) {
      var Result = 0.0;
      Result = Math.sqrt($lp1(asz.cx - this.cx) + $lp1(asz.cy - this.cy));
      return Result;
    };
    this.IsZero = function () {
      var Result = false;
      Result = $lp3(this.cx,0.0,0.0) && $lp3(this.cy,0.0,0.0);
      return Result;
    };
    this.Subtract = function (asz) {
      var Result = $lt7.$new();
      Result.cx = this.cx - asz.cx;
      Result.cy = this.cy - asz.cy;
      return Result;
    };
    this.Subtract$1 = function (asz) {
      var Result = $lt7.$new();
      Result.cx = this.cx - asz.cx;
      Result.cy = this.cy - asz.cy;
      return Result;
    };
    this.SwapDimensions = function () {
      var Result = $lt7.$new();
      Result.cx = this.cy;
      Result.cy = this.cx;
      return Result;
    };
    this.Scale = function (afactor) {
      var Result = $lt7.$new();
      Result.cx = afactor * this.cx;
      Result.cy = afactor * this.cy;
      return Result;
    };
    this.Ceiling = function () {
      var Result = $lt3.$new();
      Result.cx = $lp4(this.cx);
      Result.cy = $lp4(this.cy);
      return Result;
    };
    this.Truncate = function () {
      var Result = $lt3.$new();
      Result.cx = $lp2(this.cx);
      Result.cy = $lp2(this.cy);
      return Result;
    };
    this.Floor = function () {
      var Result = $lt3.$new();
      Result.cx = $lp5(this.cx);
      Result.cy = $lp5(this.cy);
      return Result;
    };
    this.Round = function () {
      var Result = $lt3.$new();
      Result.cx = Math.round(this.cx);
      Result.cy = Math.round(this.cy);
      return Result;
    };
    this.Length = function () {
      var Result = 0.0;
      Result = Math.sqrt($lp1(this.cx) + $lp1(this.cy));
      return Result;
    };
    this.ToString = function (aSize, aDecimals) {
      var Result = "";
      var Sx = "";
      var Sy = "";
      Sx = $impl.SingleToStr(this.cx,aSize,aDecimals);
      Sy = $impl.SingleToStr(this.cy,aSize,aDecimals);
      Result = "(" + Sx + "x" + Sy + ")";
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = this.ToString(8,2);
      return Result;
    };
    this.Create = function (ax, ay) {
      var Result = $lt7.$new();
      Result.cx = ax;
      Result.cy = ay;
      return Result;
    };
    this.Create$1 = function (asz) {
      var Result = $lt7.$new();
      Result.cx = asz.cx;
      Result.cy = asz.cy;
      return Result;
    };
    var $r = $mod.$rtti.$Record("TSizeF",{},this);
    $r.addField("cx",rtl.double);
    $r.addField("cy",rtl.double);
    $r.addMethod("Add",1,[["asz",$mod.$rtti["TSize"],2]],2,$r);
    $r.addMethod("Add$1",1,[["asz",$r,2]],2,$r);
    $r.addMethod("Distance",1,[["asz",$r,2]],2,rtl.double);
    $r.addMethod("IsZero",1,[],2,rtl.boolean);
    $r.addMethod("Subtract",1,[["asz",$r,2]],2,$r);
    $r.addMethod("Subtract$1",1,[["asz",$mod.$rtti["TSize"],2]],2,$r);
    $r.addMethod("SwapDimensions",1,[],2,$r);
    $r.addMethod("Scale",1,[["afactor",rtl.double]],2,$r);
    $r.addMethod("Ceiling",1,[],2,$mod.$rtti["TSize"]);
    $r.addMethod("Truncate",1,[],2,$mod.$rtti["TSize"]);
    $r.addMethod("Floor",1,[],2,$mod.$rtti["TSize"]);
    $r.addMethod("Round",1,[],2,$mod.$rtti["TSize"]);
    $r.addMethod("Length",1,[],2,rtl.double);
    $r.addMethod("ToString",1,[["aSize",rtl.byte],["aDecimals",rtl.byte]],2,rtl.string);
    $r.addMethod("ToString$1",1,[],2,rtl.string);
    $r.addMethod("Create",5,[["ax",rtl.double,2],["ay",rtl.double,2]],2,$r,1);
    $r.addMethod("Create$1",5,[["asz",$mod.$rtti["TSize"],2]],2,$r,1);
    $r.addProperty("Width",0,rtl.double,"cx","cx",2);
    $r.addProperty("Height",0,rtl.double,"cy","cy",2);
  });
  $lt8 = this.TVertRectAlign = {"0": "Center", Center: 0, "1": "Top", Top: 1, "2": "Bottom", Bottom: 2};
  this.$rtti.$Enum("TVertRectAlign",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TVertRectAlign});
  $lt9 = this.THorzRectAlign = {"0": "Center", Center: 0, "1": "Left", Left: 1, "2": "Right", Right: 2};
  this.$rtti.$Enum("THorzRectAlign",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.THorzRectAlign});
  this.$rtti.$Pointer("PRectF",{reftype: this.$rtti["TRectF"]});
  rtl.recNewT(this,"TRectF",function () {
    $lt10 = this;
    this.Left = 0.0;
    this.Top = 0.0;
    this.Right = 0.0;
    this.Bottom = 0.0;
    this.$eq = function (b) {
      return (this.Left === b.Left) && (this.Top === b.Top) && (this.Right === b.Right) && (this.Bottom === b.Bottom);
    };
    this.$assign = function (s) {
      this.Left = s.Left;
      this.Top = s.Top;
      this.Right = s.Right;
      this.Bottom = s.Bottom;
      return this;
    };
    this.GetBottomRight = function () {
      var Result = $lt6.$new();
      Result.$assign($lt6.Create(this.Right,this.Bottom));
      return Result;
    };
    this.GetLocation = function () {
      var Result = $lt6.$new();
      Result.x = this.Left;
      Result.y = this.Top;
      return Result;
    };
    this.GetSize = function () {
      var Result = $lt7.$new();
      Result.cx = this.GetWidth();
      Result.cy = this.GetHeight();
      return Result;
    };
    this.GetTopLeft = function () {
      var Result = $lt6.$new();
      Result.$assign($lt6.Create(this.Left,this.Top));
      return Result;
    };
    this.SetBottomRight = function (aValue) {
      this.Right = aValue.x;
      this.Bottom = aValue.y;
    };
    this.SetSize = function (AValue) {
      this.Bottom = this.Top + AValue.cy;
      this.Right = this.Left + AValue.cx;
    };
    this.GetHeight = function () {
      var Result = 0.0;
      Result = this.Bottom - this.Top;
      return Result;
    };
    this.GetWidth = function () {
      var Result = 0.0;
      Result = this.Right - this.Left;
      return Result;
    };
    this.SetHeight = function (AValue) {
      this.Bottom = this.Top + AValue;
    };
    this.SetTopLeft = function (aValue) {
      this.Left = aValue.x;
      this.Top = aValue.y;
    };
    this.SetWidth = function (AValue) {
      this.Right = this.Left + AValue;
    };
    this.Create = function (Origin) {
      this.SetTopLeft(Origin);
      this.SetBottomRight(Origin);
      return this;
    };
    this.Create$1 = function (Origin, AWidth, AHeight) {
      this.SetTopLeft(Origin);
      this.SetWidth(AWidth);
      this.SetHeight(AHeight);
      return this;
    };
    this.Create$2 = function (ALeft, ATop, ARight, ABottom) {
      this.Left = ALeft;
      this.Top = ATop;
      this.Right = ARight;
      this.Bottom = ABottom;
      return this;
    };
    this.Create$3 = function (P1, P2, Normalize) {
      this.SetTopLeft(P1);
      this.SetBottomRight(P2);
      if (Normalize) this.NormalizeRect();
      return this;
    };
    this.Create$4 = function (R, Normalize) {
      this.$assign(R);
      if (Normalize) this.NormalizeRect();
      return this;
    };
    this.Create$5 = function (R, Normalize) {
      this.Left = R.Left;
      this.Top = R.Top;
      this.Right = R.Right;
      this.Bottom = R.Bottom;
      if (Normalize) this.NormalizeRect();
      return this;
    };
    this.Empty = function () {
      var Result = $lt10.$new();
      Result.$assign($lt10.$new().Create$2(0,0,0,0));
      return Result;
    };
    this.Intersect = function (R1, R2) {
      var Result = $lt10.$new();
      Result.$assign(R1);
      if (R2.Left > R1.Left) Result.Left = R2.Left;
      if (R2.Top > R1.Top) Result.Top = R2.Top;
      if (R2.Right < R1.Right) Result.Right = R2.Right;
      if (R2.Bottom < R1.Bottom) Result.Bottom = R2.Bottom;
      return Result;
    };
    this.Union = function (Points) {
      var Result = $lt10.$new();
      var i = 0;
      if (rtl.length(Points) > 0) {
        Result.SetTopLeft(Points[0]);
        Result.SetBottomRight(Points[0]);
        for (var $l = 1, $end = rtl.length(Points) - 1; $l <= $end; $l++) {
          i = $l;
          if (Points[i].x < Result.Left) Result.Left = Points[i].x;
          if (Points[i].x > Result.Right) Result.Right = Points[i].x;
          if (Points[i].y < Result.Top) Result.Top = Points[i].y;
          if (Points[i].y > Result.Bottom) Result.Bottom = Points[i].y;
        };
      } else Result.$assign($lt10.Empty());
      return Result;
    };
    this.Union$1 = function (R1, R2) {
      var Result = $lt10.$new();
      Result.$assign(R1);
      Result.Union$2(R2);
      return Result;
    };
    this.Ceiling = function () {
      var Result = $lt10.$new();
      Result.SetBottomRight($lt6.Create(this.GetBottomRight().Ceiling().X,this.GetBottomRight().Ceiling().Y));
      Result.SetTopLeft($lt6.Create(this.GetTopLeft().Ceiling().X,this.GetTopLeft().Ceiling().Y));
      return Result;
    };
    this.CenterAt = function (Dest) {
      var Result = $lt10.$new();
      Result.$assign(this);
      $mod.RectCenter$1(Result,Dest);
      return Result;
    };
    this.CenterPoint = function () {
      var Result = $lt6.$new();
      Result.x = ((this.Right - this.Left) / 2) + this.Left;
      Result.y = ((this.Bottom - this.Top) / 2) + this.Top;
      return Result;
    };
    this.Contains = function (Pt) {
      var Result = false;
      Result = (this.Left <= Pt.x) && (Pt.x < this.Right) && (this.Top <= Pt.y) && (Pt.y < this.Bottom);
      return Result;
    };
    this.Contains$1 = function (R) {
      var Result = false;
      Result = (this.Left <= R.Left) && (R.Right <= this.Right) && (this.Top <= R.Top) && (R.Bottom <= this.Bottom);
      return Result;
    };
    this.EqualsTo = function (R, Epsilon) {
      var Result = false;
      Result = this.GetTopLeft().EqualsTo(R.GetTopLeft(),Epsilon);
      Result = Result && this.GetBottomRight().EqualsTo(R.GetBottomRight(),Epsilon);
      return Result;
    };
    this.Fit = function (Dest) {
      var Result = 0.0;
      var R = $lt10.$new();
      R.$assign(this.FitInto$1(Dest,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }}));
      this.$assign(R);
      return Result;
    };
    this.FitInto = function (Dest) {
      var Result = $lt10.$new();
      var Ratio = 0.0;
      Result.$assign(this.FitInto$1(Dest,{get: function () {
          return Ratio;
        }, set: function (v) {
          Ratio = v;
        }}));
      return Result;
    };
    this.FitInto$1 = function (Dest, Ratio) {
      var Result = $lt10.$new();
      if ((Dest.GetWidth() <= 0) || (Dest.GetHeight() <= 0)) {
        Ratio.set(1.0);
        return this;
      };
      Ratio.set(Math.max(this.GetWidth() / Dest.GetWidth(),this.GetHeight() / Dest.GetHeight()));
      if (Ratio.get() === 0) return this;
      Result.SetWidth(this.GetWidth() / Ratio.get());
      Result.SetHeight(this.GetHeight() / Ratio.get());
      Result.Left = this.Left + ((this.GetWidth() - Result.GetWidth()) / 2);
      Result.Top = this.Top + ((this.GetHeight() - Result.GetHeight()) / 2);
      return Result;
    };
    this.IntersectsWith = function (R) {
      var Result = false;
      Result = (this.Left < R.Right) && (R.Left < this.Right) && (this.Top < R.Bottom) && (R.Top < this.Bottom);
      return Result;
    };
    this.IsEmpty = function () {
      var Result = false;
      Result = ($lp8(this.Right,this.Left,0.0) <= 0) || ($lp8(this.Bottom,this.Top,0.0) <= 0);
      return Result;
    };
    this.PlaceInto = function (Dest, AHorzAlign, AVertAlign) {
      var Result = $lt10.$new();
      var R = $lt10.$new();
      var X = 0.0;
      var Y = 0.0;
      if ((this.GetHeight() > Dest.GetHeight()) || (this.GetWidth() > Dest.GetWidth())) {
        R.$assign(this.FitInto(Dest))}
       else R.$assign(this);
      var $tmp = AHorzAlign;
      if ($tmp === 1) {
        X = Dest.Left}
       else if ($tmp === 0) {
        X = ((Dest.Left + Dest.Right) - R.GetWidth()) / 2}
       else if ($tmp === 2) X = Dest.Right - R.GetWidth();
      var $tmp1 = AVertAlign;
      if ($tmp1 === 1) {
        Y = Dest.Top}
       else if ($tmp1 === 0) {
        Y = ((Dest.Top + Dest.Bottom) - R.GetHeight()) / 2}
       else if ($tmp1 === 2) Y = Dest.Bottom - R.GetHeight();
      R.SetLocation($lt6.$clone($mod.PointF(X,Y)));
      Result.$assign(R);
      return Result;
    };
    this.Round = function () {
      var Result = $lt5.$new();
      Result.SetBottomRight(this.GetBottomRight().Round());
      Result.SetTopLeft(this.GetTopLeft().Round());
      return Result;
    };
    this.SnapToPixel = function (AScale, APlaceBetweenPixels) {
      var $Self = this;
      var Result = $lt10.$new();
      function sc(S) {
        var Result = 0.0;
        Result = $lp2(S * AScale) / AScale;
        return Result;
      };
      var R = $lt10.$new();
      var Off = 0.0;
      if (AScale <= 0) AScale = 1;
      R.Top = sc(this.Top);
      R.Left = sc(this.Left);
      R.SetWidth(sc(this.GetWidth()));
      R.SetHeight(sc(this.GetHeight()));
      if (APlaceBetweenPixels) {
        Off = 1 / (2 * AScale);
        R.Offset(Off,Off);
      };
      Result.$assign(R);
      return Result;
    };
    this.Truncate = function () {
      var Result = $lt5.$new();
      Result.SetBottomRight(this.GetBottomRight().Truncate());
      Result.SetTopLeft(this.GetTopLeft().Truncate());
      return Result;
    };
    this.Inflate = function (DL, DT, DR, DB) {
      this.Left = this.Left - DL;
      this.Top = this.Top - DT;
      this.Right = this.Right + DR;
      this.Bottom = this.Bottom + DB;
    };
    this.Inflate$1 = function (DX, DY) {
      this.Left = this.Left - DX;
      this.Top = this.Top - DY;
      this.Right = this.Right + DX;
      this.Bottom = this.Bottom + DY;
    };
    this.Intersect$1 = function (R) {
      this.$assign($lt10.Intersect($lt10.$clone(this),$lt10.$clone(R)));
    };
    this.NormalizeRect = function () {
      var x = 0.0;
      if (this.Top > this.Bottom) {
        x = this.Top;
        this.Top = this.Bottom;
        this.Bottom = x;
      };
      if (this.Left > this.Right) {
        x = this.Left;
        this.Left = this.Right;
        this.Right = x;
      };
    };
    this.Offset = function (dx, dy) {
      this.Left = this.Left + dx;
      this.Right = this.Right + dx;
      this.Bottom = this.Bottom + dy;
      this.Top = this.Top + dy;
    };
    this.Offset$1 = function (DP) {
      this.Left = this.Left + DP.x;
      this.Right = this.Right + DP.x;
      this.Bottom = this.Bottom + DP.y;
      this.Top = this.Top + DP.y;
    };
    this.SetLocation = function (P) {
      this.Offset(P.x - this.Left,P.y - this.Top);
    };
    this.ToString = function (aSize, aDecimals, aUseSize) {
      var Result = "";
      var S = "";
      if (aUseSize) {
        S = this.GetSize().ToString(aSize,aDecimals)}
       else S = this.GetBottomRight().ToString(aSize,aDecimals);
      Result = "[" + this.GetTopLeft().ToString(aSize,aDecimals) + " - " + S + "]";
      return Result;
    };
    this.ToString$1 = function (aUseSize) {
      var Result = "";
      Result = this.ToString(8,2,aUseSize);
      return Result;
    };
    this.Union$2 = function (r) {
      this.Left = Math.min(r.Left,this.Left);
      this.Top = Math.min(r.Top,this.Top);
      this.Right = Math.max(r.Right,this.Right);
      this.Bottom = Math.max(r.Bottom,this.Bottom);
    };
    var $r = $mod.$rtti.$Record("TRectF",{},this);
    $r.addField("Left",rtl.double);
    $r.addField("Top",rtl.double);
    $r.addField("Right",rtl.double);
    $r.addField("Bottom",rtl.double);
    $r.addMethod("Create",2,[["Origin",$mod.$rtti["TPointF"]]]);
    $r.addMethod("Create$1",2,[["Origin",$mod.$rtti["TPointF"]],["AWidth",rtl.double],["AHeight",rtl.double]]);
    $r.addMethod("Create$2",2,[["ALeft",rtl.double],["ATop",rtl.double],["ARight",rtl.double],["ABottom",rtl.double]]);
    $r.addMethod("Create$3",2,[["P1",$mod.$rtti["TPointF"]],["P2",$mod.$rtti["TPointF"]],["Normalize",rtl.boolean]]);
    $r.addMethod("Create$4",2,[["R",$r],["Normalize",rtl.boolean]]);
    $r.addMethod("Create$5",2,[["R",$mod.$rtti["TRect"]],["Normalize",rtl.boolean]]);
    $r.addMethod("Empty",5,[],2,$r,1);
    $r.addMethod("Intersect",5,[["R1",$r],["R2",$r]],2,$r,1);
    $r.addMethod("Union",5,[["Points",$mod.$rtti["TPointF"],10]],2,$r,1);
    $r.addMethod("Union$1",5,[["R1",$r],["R2",$r]],2,$r,1);
    $r.addMethod("Ceiling",1,[],2,$r);
    $r.addMethod("CenterAt",1,[["Dest",$r,2]],2,$r);
    $r.addMethod("CenterPoint",1,[],2,$mod.$rtti["TPointF"]);
    $r.addMethod("Contains",1,[["Pt",$mod.$rtti["TPointF"]]],2,rtl.boolean);
    $r.addMethod("Contains$1",1,[["R",$r]],2,rtl.boolean);
    $r.addMethod("EqualsTo",1,[["R",$r,2],["Epsilon",rtl.double,2]],2,rtl.boolean);
    $r.addMethod("Fit",1,[["Dest",$r,2]],2,rtl.double);
    $r.addMethod("FitInto",1,[["Dest",$r,2]],2,$r);
    $r.addMethod("FitInto$1",1,[["Dest",$r,2],["Ratio",rtl.double,4]],2,$r);
    $r.addMethod("IntersectsWith",1,[["R",$r]],2,rtl.boolean);
    $r.addMethod("IsEmpty",1,[],2,rtl.boolean);
    $r.addMethod("PlaceInto",1,[["Dest",$r,2],["AHorzAlign",$mod.$rtti["THorzRectAlign"],2],["AVertAlign",$mod.$rtti["TVertRectAlign"],2]],2,$r);
    $r.addMethod("Round",1,[],2,$mod.$rtti["TRect"]);
    $r.addMethod("SnapToPixel",1,[["AScale",rtl.double],["APlaceBetweenPixels",rtl.boolean]],2,$r);
    $r.addMethod("Truncate",1,[],2,$mod.$rtti["TRect"]);
    $r.addMethod("Inflate",0,[["DL",rtl.double],["DT",rtl.double],["DR",rtl.double],["DB",rtl.double]]);
    $r.addMethod("Inflate$1",0,[["DX",rtl.double],["DY",rtl.double]]);
    $r.addMethod("Intersect$1",0,[["R",$r]]);
    $r.addMethod("NormalizeRect",0,[]);
    $r.addMethod("Offset",0,[["dx",rtl.double,2],["dy",rtl.double,2]]);
    $r.addMethod("Offset$1",0,[["DP",$mod.$rtti["TPointF"]]]);
    $r.addMethod("SetLocation",0,[["P",$mod.$rtti["TPointF"]]]);
    $r.addMethod("ToString",1,[["aSize",rtl.byte],["aDecimals",rtl.byte],["aUseSize",rtl.boolean]],2,rtl.string);
    $r.addMethod("ToString$1",1,[["aUseSize",rtl.boolean]],2,rtl.string);
    $r.addMethod("Union$2",0,[["r",$r,2]]);
    $r.addProperty("Width",3,rtl.double,"GetWidth","SetWidth",2);
    $r.addProperty("Height",3,rtl.double,"GetHeight","SetHeight",2);
    $r.addProperty("Size",3,$mod.$rtti["TSizeF"],"GetSize","SetSize",2);
    $r.addProperty("Location",3,$mod.$rtti["TPointF"],"GetLocation","SetLocation",2);
    $r.addProperty("TopLeft",3,$mod.$rtti["TPointF"],"GetTopLeft","SetTopLeft",2);
    $r.addProperty("BottomRight",3,$mod.$rtti["TPointF"],"GetBottomRight","SetBottomRight",2);
  });
  rtl.recNewT(this,"TPoint3D",function () {
    $lt11 = this;
    this.x = 0.0;
    this.y = 0.0;
    this.z = 0.0;
    this.$eq = function (b) {
      return (this.x === b.x) && (this.y === b.y) && (this.z === b.z);
    };
    this.$assign = function (s) {
      this.x = s.x;
      this.y = s.y;
      this.z = s.z;
      return this;
    };
    this.GetSingle3Array = function () {
      var Result = rtl.arraySetLength(null,0.0,3);
      Result = [this.x,this.y,this.z];
      return Result;
    };
    this.SetSingle3Array = function (aValue) {
      this.x = aValue[0];
      this.y = aValue[1];
      this.z = aValue[2];
    };
    this.Create = function (ax, ay, az) {
      this.x = ax;
      this.y = ay;
      this.z = az;
      return this;
    };
    this.Offset = function (adeltax, adeltay, adeltaz) {
      this.x = this.x + adeltax;
      this.y = this.y + adeltay;
      this.z = this.z + adeltaz;
    };
    this.Offset$1 = function (adelta) {
      this.x = this.x + adelta.x;
      this.y = this.y + adelta.y;
      this.z = this.z + adelta.z;
    };
    this.ToString = function (aSize, aDecimals) {
      var Result = "";
      var Sx = "";
      var Sy = "";
      var Sz = "";
      Sx = $impl.SingleToStr(this.x,aSize,aDecimals);
      Sy = $impl.SingleToStr(this.y,aSize,aDecimals);
      Sz = $impl.SingleToStr(this.z,aSize,aDecimals);
      Result = "(" + Sx + "," + Sy + "," + Sz + ")";
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = this.ToString(8,2);
      return Result;
    };
    var $r = $mod.$rtti.$Record("TPoint3D",{},this);
    $mod.$rtti.$StaticArray("TPoint3D.TSingle3Array",{dims: [3], eltype: rtl.double});
    $r.addMethod("Create",2,[["ax",rtl.double,2],["ay",rtl.double,2],["az",rtl.double,2]]);
    $r.addMethod("Offset",0,[["adeltax",rtl.double,2],["adeltay",rtl.double,2],["adeltaz",rtl.double,2]]);
    $r.addMethod("Offset$1",0,[["adelta",$r,2]]);
    $r.addMethod("ToString",1,[["aSize",rtl.byte],["aDecimals",rtl.byte]],2,rtl.string);
    $r.addMethod("ToString$1",1,[],2,rtl.string);
    $r.addProperty("Data",3,$mod.$rtti["TPoint3D.TSingle3Array"],"GetSingle3Array","SetSingle3Array",2);
    $r.addField("x",rtl.double);
    $r.addField("y",rtl.double);
    $r.addField("z",rtl.double);
  });
  this.EqualRect = function (r1, r2) {
    var Result = false;
    Result = (r1.Left === r2.Left) && (r1.Right === r2.Right) && (r1.Top === r2.Top) && (r1.Bottom === r2.Bottom);
    return Result;
  };
  this.EqualRect$1 = function (r1, r2) {
    var Result = false;
    Result = r1.EqualsTo(r2,0);
    return Result;
  };
  this.Rect = function (Left, Top, Right, Bottom) {
    var Result = $lt5.$new();
    Result.Left = Left;
    Result.Top = Top;
    Result.Right = Right;
    Result.Bottom = Bottom;
    return Result;
  };
  this.RectF = function (Left, Top, Right, Bottom) {
    var Result = $lt10.$new();
    Result.Left = Left;
    Result.Top = Top;
    Result.Right = Right;
    Result.Bottom = Bottom;
    return Result;
  };
  this.Bounds = function (ALeft, ATop, AWidth, AHeight) {
    var Result = $lt5.$new();
    Result.Left = ALeft;
    Result.Top = ATop;
    Result.Right = ALeft + AWidth;
    Result.Bottom = ATop + AHeight;
    return Result;
  };
  this.Point = function (x, y) {
    var Result = $lt4.$new();
    Result.X = x;
    Result.Y = y;
    return Result;
  };
  this.PointF = function (x, y) {
    var Result = $lt6.$new();
    Result.x = x;
    Result.y = y;
    return Result;
  };
  this.PtInRect = function (aRect, p) {
    var Result = false;
    Result = (p.Y >= aRect.Top) && (p.Y < aRect.Bottom) && (p.X >= aRect.Left) && (p.X < aRect.Right);
    return Result;
  };
  this.IntersectRect = function (aRect, R1, R2) {
    var Result = false;
    var lRect = $lt5.$new();
    lRect.$assign(R1);
    if (R2.Left > R1.Left) lRect.Left = R2.Left;
    if (R2.Top > R1.Top) lRect.Top = R2.Top;
    if (R2.Right < R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom < R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty(lRect)) {
      aRect.$assign($mod.Rect(0,0,0,0));
      Result = false;
    } else {
      Result = true;
      aRect.$assign(lRect);
    };
    return Result;
  };
  this.IntersectRect$1 = function (Rect1, Rect2) {
    var Result = false;
    Result = (Rect1.Left < Rect2.Right) && (Rect1.Right > Rect2.Left) && (Rect1.Top < Rect2.Bottom) && (Rect1.Bottom > Rect2.Top);
    return Result;
  };
  this.IntersectRect$2 = function (Rect1, Rect2) {
    var Result = false;
    Result = (Rect1.Left < Rect2.Right) && (Rect1.Right > Rect2.Left) && (Rect1.Top < Rect2.Bottom) && (Rect1.Bottom > Rect2.Top);
    return Result;
  };
  this.IntersectRect$3 = function (aRect, R1, R2) {
    var Result = false;
    var lRect = $lt10.$new();
    lRect.$assign(R1);
    if (R2.Left > R1.Left) lRect.Left = R2.Left;
    if (R2.Top > R1.Top) lRect.Top = R2.Top;
    if (R2.Right < R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom < R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty$1(lRect)) {
      aRect.$assign($mod.RectF(0.0,0.0,0.0,0.0));
      Result = false;
    } else {
      Result = true;
      aRect.$assign(lRect);
    };
    return Result;
  };
  this.UnionRect = function (aRect, R1, R2) {
    var Result = false;
    var lRect = $lt5.$new();
    lRect.$assign(R1);
    if (R2.Left < R1.Left) lRect.Left = R2.Left;
    if (R2.Top < R1.Top) lRect.Top = R2.Top;
    if (R2.Right > R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom > R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty(lRect)) {
      aRect.$assign($mod.Rect(0,0,0,0));
      Result = false;
    } else {
      aRect.$assign(lRect);
      Result = true;
    };
    return Result;
  };
  this.UnionRect$1 = function (aRectF, R1, R2) {
    var Result = false;
    var lRect = $lt10.$new();
    lRect.$assign(R1);
    if (R2.Left < R1.Left) lRect.Left = R2.Left;
    if (R2.Top < R1.Top) lRect.Top = R2.Top;
    if (R2.Right > R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom > R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty$1(lRect)) {
      aRectF.$assign($mod.RectF(0.0,0.0,0.0,0.0));
      Result = false;
    } else {
      aRectF.$assign(lRect);
      Result = true;
    };
    return Result;
  };
  this.UnionRect$2 = function (R1, R2) {
    var Result = $lt5.$new();
    Result.$assign($lt5.$new());
    $mod.UnionRect(Result,R1,R2);
    return Result;
  };
  this.UnionRect$3 = function (R1, R2) {
    var Result = $lt10.$new();
    Result.$assign($lt10.$new());
    $mod.UnionRect$1(Result,R1,R2);
    return Result;
  };
  this.IsRectEmpty = function (aRect) {
    var Result = false;
    Result = (aRect.Right <= aRect.Left) || (aRect.Bottom <= aRect.Top);
    return Result;
  };
  this.OffsetRect = function (aRect, DX, DY) {
    var Result = false;
    aRect.Left += DX;
    aRect.Top += DY;
    aRect.Right += DX;
    aRect.Bottom += DY;
    Result = true;
    return Result;
  };
  this.OffsetRect$1 = function (aRect, DX, DY) {
    var Result = false;
    aRect.Left = aRect.Left + DX;
    aRect.Top = aRect.Top + DY;
    aRect.Right = aRect.Right + DX;
    aRect.Bottom = aRect.Bottom + DY;
    Result = true;
    return Result;
  };
  this.CenterPoint = function (aRect) {
    var Result = $lt4.$new();
    function Avg(a, b) {
      var Result = 0;
      if (a < b) {
        Result = a + ((b - a) >>> 1)}
       else Result = b + ((a - b) >>> 1);
      return Result;
    };
    Result.X = Avg(aRect.Left,aRect.Right);
    Result.Y = Avg(aRect.Top,aRect.Bottom);
    return Result;
  };
  this.InflateRect = function (aRect, dx, dy) {
    var Result = false;
    aRect.Left -= dx;
    aRect.Top -= dy;
    aRect.Right += dx;
    aRect.Bottom += dy;
    Result = true;
    return Result;
  };
  this.Size = function (AWidth, AHeight) {
    var Result = $lt3.$new();
    Result.cx = AWidth;
    Result.cy = AHeight;
    return Result;
  };
  this.Size$1 = function (aRect) {
    var Result = $lt3.$new();
    Result.cx = aRect.Right - aRect.Left;
    Result.cy = aRect.Bottom - aRect.Top;
    return Result;
  };
  this.RectCenter = function (R, Bounds) {
    var Result = $lt5.$new();
    var C = $lt4.$new();
    var CS = $lt4.$new();
    C.$assign(Bounds.CenterPoint());
    CS.$assign(R.CenterPoint());
    $mod.OffsetRect(R,C.X - CS.X,C.Y - CS.Y);
    Result.$assign(R);
    return Result;
  };
  this.RectCenter$1 = function (R, Bounds) {
    var Result = $lt10.$new();
    var C = $lt6.$new();
    var CS = $lt6.$new();
    C.$assign(Bounds.CenterPoint());
    CS.$assign(R.CenterPoint());
    $mod.OffsetRect$1(R,C.x - CS.x,C.y - CS.y);
    Result.$assign(R);
    return Result;
  };
  this.NormalizeRectF = function (Pts) {
    var Result = $lt10.$new();
    var Pt = $lt6.$new();
    Result.Left = 0xFFFF;
    Result.Top = 0xFFFF;
    Result.Right = -0xFFFF;
    Result.Bottom = -0xFFFF;
    for (var $in = Pts, $l = 0, $end = rtl.length($in) - 1; $l <= $end; $l++) {
      Pt = $in[$l];
      Result.Left = Math.min(Pt.x,Result.Left);
      Result.Top = Math.min(Pt.y,Result.Top);
      Result.Right = Math.max(Pt.x,Result.Right);
      Result.Bottom = Math.max(Pt.y,Result.Bottom);
    };
    return Result;
  };
  this.NormalizeRect = function (ARect) {
    var Result = $lt10.$new();
    Result.$assign($mod.NormalizeRectF([$lt6.$clone($mod.PointF(ARect.Left,ARect.Top)),$lt6.$clone($mod.PointF(ARect.Right,ARect.Top)),$lt6.$clone($mod.PointF(ARect.Right,ARect.Bottom)),$lt6.$clone($mod.PointF(ARect.Left,ARect.Bottom))]));
    return Result;
  };
  this.PtInRect$1 = function (Rect, p) {
    var Result = false;
    Result = (p.y >= Rect.Top) && (p.y < Rect.Bottom) && (p.x >= Rect.Left) && (p.x < Rect.Right);
    return Result;
  };
  this.RectHeight = function (Rect) {
    var Result = 0;
    Result = Rect.getHeight();
    return Result;
  };
  this.RectHeight$1 = function (Rect) {
    var Result = 0.0;
    Result = Rect.GetHeight();
    return Result;
  };
  this.RectWidth = function (Rect) {
    var Result = 0;
    Result = Rect.getWidth();
    return Result;
  };
  this.RectWidth$1 = function (Rect) {
    var Result = 0.0;
    Result = Rect.GetWidth();
    return Result;
  };
  this.IsRectEmpty$1 = function (Rect) {
    var Result = false;
    Result = Rect.IsEmpty();
    return Result;
  };
  this.MultiplyRect = function (R, DX, DY) {
    R.Left = DX * R.Left;
    R.Right = DX * R.Right;
    R.Top = DY * R.Top;
    R.Bottom = DY * R.Bottom;
  };
  this.InflateRect$1 = function (Rect, dx, dy) {
    var Result = false;
    Result = true;
    Rect.Left = Rect.Left - dx;
    Rect.Top = Rect.Top - dy;
    Rect.Right = Rect.Right + dx;
    Rect.Bottom = Rect.Bottom + dy;
    return Result;
  };
  this.Size$2 = function (ARect) {
    var Result = $lt7.$new();
    Result.cx = ARect.Right - ARect.Left;
    Result.cy = ARect.Bottom - ARect.Top;
    return Result;
  };
  this.ScalePoint = function (P, dX, dY) {
    var Result = $lt6.$new();
    Result.x = P.x * dX;
    Result.y = P.y * dY;
    return Result;
  };
  this.ScalePoint$1 = function (P, dX, dY) {
    var Result = $lt4.$new();
    Result.X = Math.round(P.X * dX);
    Result.Y = Math.round(P.Y * dY);
    return Result;
  };
  this.MinPoint = function (P1, P2) {
    var Result = $lt6.$new();
    Result.$assign(P1);
    if ((P2.y < P1.y) || ((P2.y === P1.y) && (P2.x < P1.x))) Result.$assign(P2);
    return Result;
  };
  this.MinPoint$1 = function (P1, P2) {
    var Result = $lt4.$new();
    Result.$assign(P1);
    if ((P2.Y < P1.Y) || ((P2.Y === P1.Y) && (P2.X < P1.X))) Result.$assign(P2);
    return Result;
  };
  this.SplitRect = function (Rect, SplitType, Size) {
    var Result = $lt5.$new();
    Result.$assign(Rect.SplitRect(SplitType,Size));
    return Result;
  };
  this.SplitRect$1 = function (Rect, SplitType, Percent) {
    var Result = $lt5.$new();
    Result.$assign(Rect.SplitRect$1(SplitType,Percent));
    return Result;
  };
  this.CenteredRect = function (SourceRect, aCenteredRect) {
    var Result = $lt5.$new();
    var W = 0;
    var H = 0;
    var Center = $lt4.$new();
    W = aCenteredRect.getWidth();
    H = aCenteredRect.getHeight();
    Center.$assign(SourceRect.CenterPoint());
    Result.$assign($mod.Rect(Center.X - rtl.trunc(W / 2),Center.Y - rtl.trunc(H / 2),Center.X + rtl.trunc((W + 1) / 2),Center.Y + rtl.trunc((H + 1) / 2)));
    return Result;
  };
  this.IntersectRectF = function (Rect, R1, R2) {
    var Result = false;
    Result = $mod.IntersectRect$3(Rect,R1,R2);
    return Result;
  };
  this.UnionRectF = function (Rect, R1, R2) {
    var Result = false;
    Result = $mod.UnionRect$1(Rect,R1,R2);
    return Result;
  };
  $mod.$implcode = function () {
    $lm1 = pas.Math;
    $lp3 = $lm1.SameValue;
    $lp4 = $lm1.Ceil;
    $lp5 = $lm1.Floor;
    $lp6 = $lm1.SinCos;
    $lp7 = $lm1.EnsureRange$1;
    $lp8 = $lm1.CompareValue$3;
    $impl.SingleToStr = function (aValue, aSize, aDecimals) {
      var Result = "";
      var S = "";
      var Len = 0;
      var P = 0;
      S = rtl.floatToStr(aValue,aSize,aDecimals);
      Len = S.length;
      P = 1;
      while ((P <= Len) && (S.charAt(P - 1) === " ")) P += 1;
      if (P > 1) $lp9({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},1,P - 1);
      Result = S;
      return Result;
    };
  };
},["Math"]);
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  var $lt = null;
  var $lt1 = null;
  var $lt2 = null;
  var $lt3 = null;
  var $lt4 = null;
  var $lt5 = null;
  var $lt6 = null;
  var $lt7 = null;
  var $lt8 = null;
  var $lt9 = null;
  var $lt10 = null;
  var $lt11 = null;
  var $lt12 = null;
  var $lt13 = null;
  var $lt14 = null;
  var $lt15 = null;
  var $lt16 = null;
  var $lt17 = null;
  var $lt18 = null;
  var $lt19 = null;
  var $lt20 = null;
  var $lt21 = null;
  var $lt22 = null;
  var $lt23 = null;
  var $lt24 = null;
  var $lt25 = null;
  var $lt26 = null;
  var $lt27 = null;
  var $lt28 = null;
  var $lt29 = null;
  var $lt30 = null;
  var $lt31 = null;
  var $lt32 = null;
  var $lt33 = null;
  var $lt34 = null;
  var $lt35 = null;
  var $lt36 = null;
  var $lt37 = null;
  var $lt38 = null;
  var $lt39 = null;
  var $lt40 = null;
  var $lt41 = null;
  var $lt42 = null;
  var $lt43 = null;
  var $lt44 = null;
  var $lt45 = null;
  var $lt46 = null;
  var $lt47 = null;
  var $lt48 = null;
  var $lt49 = null;
  var $lt50 = null;
  var $lt51 = null;
  var $lt52 = null;
  var $lt53 = null;
  var $lt54 = null;
  var $lt55 = null;
  var $lt56 = null;
  var $lt57 = null;
  var $lt58 = null;
  var $lt59 = null;
  var $lt60 = null;
  var $lt61 = null;
  var $lt62 = null;
  var $lt63 = null;
  var $lt64 = null;
  var $lt65 = null;
  var $lt66 = null;
  var $lt67 = null;
  var $lt68 = null;
  var $lt69 = null;
  var $lt70 = null;
  var $lt71 = null;
  var $lt72 = null;
  var $lt73 = null;
  var $lt74 = null;
  var $lt75 = null;
  var $lt76 = null;
  var $lt77 = null;
  var $lt78 = null;
  var $lt79 = null;
  var $lt80 = null;
  var $lt81 = null;
  var $lt82 = null;
  var $lt83 = null;
  var $lt84 = null;
  var $lt85 = null;
  var $lt86 = null;
  var $lm = pas.System;
  var $lt87 = $lm.TObject;
  this.$rtti.$ExtClass("TJSArray");
  this.$rtti.$ExtClass("TJSMap");
  this.$rtti.$ExtClass("TJSBigInt");
  rtl.createClass(this,"EJS",$lt87,function () {
    $lt = this;
    this.$init = function () {
      $lt87.$init.call(this);
      this.FMessage = "";
    };
    this.Create$1 = function (Msg) {
      this.FMessage = Msg;
      return this;
    };
  });
  this.$rtti.$ExtClass("TJSObject",{jsclass: "Object"});
  this.$rtti.$ClassRef("TJSObjectClass",{instancetype: this.$rtti["TJSObject"]});
  this.$rtti.$DynArray("TJSObjectDynArray",{eltype: this.$rtti["TJSObject"]});
  this.$rtti.$DynArray("TJSObjectDynArrayArray",{eltype: this.$rtti["TJSObjectDynArray"]});
  this.$rtti.$DynArray("TJSStringDynArray",{eltype: rtl.string});
  this.$rtti.$ExtClass("TJSIteratorValue",{jsclass: "IteratorValue"});
  this.$rtti.$ExtClass("TJSIterator",{jsclass: "Iterator"});
  this.$rtti.$ExtClass("TJSSet");
  this.$rtti.$RefToProcVar("TJSSetEventProc",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.nativeint],["set_",this.$rtti["TJSSet"]]])});
  this.$rtti.$RefToProcVar("TJSSetProcCallBack",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.jsvalue]])});
  this.$rtti.$ExtClass("TJSSet",{jsclass: "Set"});
  this.$rtti.$RefToProcVar("TJSMapFunctionCallBack",{procsig: rtl.newTIProcSig([["arg",rtl.jsvalue]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSMapProcCallBack",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.jsvalue]])});
  this.$rtti.$ExtClass("TJSMap",{jsclass: "Map"});
  this.$rtti.$ExtClass("TJSFunction",{ancestor: this.$rtti["TJSObject"], jsclass: "Function"});
  this.$rtti.$ExtClass("TJSDate",{ancestor: this.$rtti["TJSFunction"], jsclass: "Date"});
  this.$rtti.$ExtClass("TJSSymbol",{ancestor: this.$rtti["TJSFunction"], jsclass: "Symbol"});
  rtl.recNewT(this,"TLocaleCompareOptions",function () {
    $lt9 = this;
    this.localematched = "";
    this.usage = "";
    this.sensitivity = "";
    this.ignorePunctuation = false;
    this.numeric = false;
    this.caseFirst = "";
    this.$eq = function (b) {
      return (this.localematched === b.localematched) && (this.usage === b.usage) && (this.sensitivity === b.sensitivity) && (this.ignorePunctuation === b.ignorePunctuation) && (this.numeric === b.numeric) && (this.caseFirst === b.caseFirst);
    };
    this.$assign = function (s) {
      this.localematched = s.localematched;
      this.usage = s.usage;
      this.sensitivity = s.sensitivity;
      this.ignorePunctuation = s.ignorePunctuation;
      this.numeric = s.numeric;
      this.caseFirst = s.caseFirst;
      return this;
    };
    var $r = $mod.$rtti.$Record("TLocaleCompareOptions",{},this);
    $r.addField("localematched",rtl.string);
    $r.addField("usage",rtl.string);
    $r.addField("sensitivity",rtl.string);
    $r.addField("ignorePunctuation",rtl.boolean);
    $r.addField("numeric",rtl.boolean);
    $r.addField("caseFirst",rtl.string);
  });
  this.$rtti.$ExtClass("TJSRegexp",{jsclass: "RegExp"});
  this.$rtti.$RefToProcVar("TReplaceCallBack",{procsig: rtl.newTIProcSig([["match",rtl.string,2]],rtl.string,2)});
  this.$rtti.$RefToProcVar("TReplaceCallBack0",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$RefToProcVar("TReplaceCallBack1",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["p1",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$RefToProcVar("TReplaceCallBack2",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["p1",rtl.string,2],["p2",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$ExtClass("TJSString",{jsclass: "String"});
  this.$rtti.$RefToProcVar("TJSArrayEventProc",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]])});
  this.$rtti.$RefToProcVar("TJSArrayEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.boolean)});
  this.$rtti.$RefToProcVar("TJSArrayMapEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSArrayReduceEvent",{procsig: rtl.newTIProcSig([["accumulator",rtl.jsvalue],["currentValue",rtl.jsvalue],["currentIndex",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSArrayCompareEvent",{procsig: rtl.newTIProcSig([["a",rtl.jsvalue],["b",rtl.jsvalue]],rtl.nativeint)});
  this.$rtti.$ExtClass("TJSArray",{jsclass: "Array"});
  this.$rtti.$ExtClass("TJSAbstractArrayBuffer",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSArrayBuffer",{ancestor: this.$rtti["TJSAbstractArrayBuffer"], jsclass: "ArrayBuffer"});
  this.$rtti.$ExtClass("TJSSharedArrayBuffer",{ancestor: this.$rtti["TJSAbstractArrayBuffer"], jsclass: "SharedArrayBuffer"});
  this.$rtti.$ExtClass("TJSBufferSource",{ancestor: this.$rtti["TJSObject"], jsclass: "BufferSource"});
  this.$rtti.$ExtClass("TJSTypedArray");
  this.$rtti.$RefToProcVar("TJSTypedArrayCallBack",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.boolean)});
  this.$rtti.$RefToProcVar("TJSTypedArrayMapCallBack",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSTypedArrayReduceCallBack",{procsig: rtl.newTIProcSig([["accumulator",rtl.jsvalue],["currentValue",rtl.jsvalue],["currentIndex",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSTypedArrayCompareCallBack",{procsig: rtl.newTIProcSig([["a",rtl.jsvalue],["b",rtl.jsvalue]],rtl.nativeint)});
  this.$rtti.$ExtClass("TJSTypedArray",{ancestor: this.$rtti["TJSBufferSource"], jsclass: "TypedArray"});
  this.$rtti.$ClassRef("TJSTypedArrayClass",{instancetype: this.$rtti["TJSTypedArray"]});
  this.$rtti.$ExtClass("TJSInt8Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int8Array"});
  this.$rtti.$ExtClass("TJSUint8Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint8Array"});
  this.$rtti.$ExtClass("TJSUint8ClampedArray",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint8ClampedArray"});
  this.$rtti.$ExtClass("TJSInt16Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int16Array"});
  this.$rtti.$ExtClass("TJSUint16Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint16Array"});
  this.$rtti.$ExtClass("TJSInt32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int32Array"});
  this.$rtti.$ExtClass("TJSUint32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint32Array"});
  this.$rtti.$ExtClass("TJSFloat32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Float32Array"});
  this.$rtti.$ExtClass("TJSFloat64Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Float64Array"});
  this.$rtti.$ExtClass("TJSDataView",{ancestor: this.$rtti["TJSBufferSource"], jsclass: "DataView"});
  this.$rtti.$ExtClass("TJSJSON",{ancestor: this.$rtti["TJSObject"], jsclass: "JSON"});
  this.$rtti.$ExtClass("TJSError",{ancestor: this.$rtti["TJSObject"], jsclass: "Error"});
  this.$rtti.$ExtClass("TJSPromise");
  this.$rtti.$ExtClass("TJSPromiseResolvers",{jsclass: "Object"});
  this.$rtti.$RefToProcVar("TJSPromiseResolver",{procsig: rtl.newTIProcSig([["aValue",rtl.jsvalue]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSPromiseExecutor",{procsig: rtl.newTIProcSig([["resolve",this.$rtti["TJSPromiseResolver"]],["reject",this.$rtti["TJSPromiseResolver"]]])});
  this.$rtti.$RefToProcVar("TJSPromiseFinallyHandler",{procsig: rtl.newTIProcSig([])});
  this.$rtti.$ExtClass("TJSPromise",{jsclass: "Promise"});
  this.$rtti.$ExtClass("TJSFunctionArguments",{jsclass: "arguments"});
  this.$rtti.$ExtClass("TJSIteratorResult",{ancestor: this.$rtti["TJSObject"], jsclass: "IteratorResult"});
  this.$rtti.$ExtClass("TJSAsyncIterator",{ancestor: this.$rtti["TJSObject"], jsclass: "AsyncIterator"});
  this.$rtti.$ExtClass("TJSSyntaxError",{ancestor: this.$rtti["TJSError"], jsclass: "SyntaxError"});
  this.$rtti.$ExtClass("TJSTextDecoderOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextDecodeOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextDecoder",{ancestor: this.$rtti["TJSObject"], jsclass: "TextDecoder"});
  this.$rtti.$ExtClass("TJSTextEncoderEncodeIntoResult",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextEncoder",{ancestor: this.$rtti["TJSObject"], jsclass: "TextEncoder"});
  this.$rtti.$ExtClass("TGGenerator<System.JSValue>",{ancestor: this.$rtti["TJSObject"], jsclass: "Generator"});
  this.$rtti.$ExtClass("TGGenerator<System.JSValue>.TGGeneratorValue",{ancestor: this.$rtti["TJSObject"], jsclass: "Generator"});
  this.$rtti.$ExtClass("TJSProxy",{ancestor: this.$rtti["TJSObject"], jsclass: "Proxy"});
  this.$rtti.$ExtClass("TJSNumber",{ancestor: this.$rtti["TJSFunction"], jsclass: "Number"});
  this.$rtti.$ExtClass("TJSBigInt",{ancestor: this.$rtti["TJSObject"], jsclass: "BigInt"});
  rtl.createHelper(this,"TJSBigIntHelper",null,function () {
    $lt46 = this;
    this.New = function (aValue) {
      var Result = null;
      Result = BigInt(aValue);
      return Result;
    };
  });
  this.$rtti.$ExtClass("TJSAtomicWaitResult",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSAtomics",{ancestor: this.$rtti["TJSObject"], jsclass: "Atomics"});
  this.$rtti.$ExtClass("TJSLocalesOfOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFormatRangePart",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSFormatRangePartArray",{eltype: this.$rtti["TJSFormatRangePart"]});
  this.$rtti.$ExtClass("TJSFormatDatePart",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSFormatDatePartArray",{eltype: this.$rtti["TJSFormatDatePart"]});
  this.$rtti.$ExtClass("TJSDateTimeResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSDateLocaleOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlDateTimeFormat",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.DateTimeFormat"});
  this.$rtti.$ExtClass("TJSDisplayNamesOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlDisplayNamesResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlDisplayNames",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.DisplayNames"});
  this.$rtti.$ExtClass("TJSDurationLocaleOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFormatDurationPart",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSFormatDurationPartArray",{eltype: this.$rtti["TJSFormatDurationPart"]});
  this.$rtti.$ExtClass("TJSDurationResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSDuration",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlDurationFormat",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.DurationFormat"});
  this.$rtti.$ExtClass("TJSListFormatOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSListFormatResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFormatListPart",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSFormatListPartArray",{eltype: this.$rtti["TJSFormatListPart"]});
  this.$rtti.$ExtClass("TJSIntlListFormat",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.ListFormat"});
  this.$rtti.$ExtClass("TJSIntlLocaleOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlTextInfo",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlWeekInfo",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlLocale",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.Locale"});
  this.$rtti.$ExtClass("TJSNumberFormatOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSNumberFormatResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlNumberPart",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSIntlNumberPartArray",{eltype: this.$rtti["TJSIntlNumberPart"]});
  this.$rtti.$ExtClass("TJSIntlNumberFormat",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.NumberFormat"});
  this.$rtti.$ExtClass("TJSIntlCollatorOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlCollatorResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlCollator",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.Collator"});
  this.$rtti.$ExtClass("TJSIntlPluralRuleOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlPluralRuleResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlPluralRules",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.PluralRules"});
  this.$rtti.$ExtClass("TJSRelativeTimeParts",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$DynArray("TJSRelativeTimePartsArray",{eltype: this.$rtti["TJSRelativeTimeParts"]});
  this.$rtti.$ExtClass("TJSIntlRelativeTimeFormatOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlRelativeTimeFormatResolvedOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSIntlRelativeTimeFormat",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl.RelativeTimeFormat"});
  this.$rtti.$ExtClass("TJSIntl",{ancestor: this.$rtti["TJSObject"], jsclass: "Intl"});
  this.Symbol$1 = function () {
    return Symbol();
  };
  this.Symbol$2 = function (Description) {
    return Symbol(Description);
  };
  this.AsNumber = function (v) {
    return Number(v);
  };
  this.AsIntNumber = function (v) {
    return Number(v);
  };
  this.JSValueArrayOf = function (Args) {
    var Result = [];
    var I = 0;
    Result = rtl.arraySetLength(Result,undefined,rtl.length(Args));
    for (var $l = 0, $end = rtl.length(Args) - 1; $l <= $end; $l++) {
      I = $l;
      Result[I] = Args[I].VJSValue;
    };
    return Result;
  };
  this.New = function (aElements) {
    var Result = null;
    var L = 0;
    var I = 0;
    var S = "";
    L = rtl.length(aElements);
    if ((L % 2) === 1) throw $lt.$create("Create$1",["Number of arguments must be even"]);
    I = 0;
    while (I < L) {
      if (!rtl.isString(aElements[I])) {
        S = String(I);
        throw $lt.$create("Create$1",["Argument " + S + " must be a string."]);
      };
      I += 2;
    };
    I = 0;
    Result = new Object();
    while (I < L) {
      S = "" + aElements[I];
      Result[S] = aElements[I + 1];
      I += 2;
    };
    return Result;
  };
  this.JSDelete = function (Obj, PropName) {
    return delete Obj[PropName];
  };
  this.hasValue = function (v) {
    if(v){ return true; } else { return false; };
  };
  this.jsIn = function (keyName, object) {
    return keyName in object;
  };
  this.isBoolean = function (v) {
    return typeof(v) == 'boolean';
  };
  this.isDate = function (v) {
    return (v instanceof Date);
  };
  this.isCallback = function (v) {
    return rtl.isObject(v) && rtl.isObject(v.scope) && (rtl.isString(v.fn) || rtl.isFunction(v.fn));
  };
  this.isChar = function (v) {
    return (typeof(v)!="string") && (v.length==1);
  };
  this.isClass = function (v) {
    return (typeof(v)=="object") && (v!=null) && (v.$class == v);
  };
  this.isClassInstance = function (v) {
    return (typeof(v)=="object") && (v!=null) && (v.$class == Object.getPrototypeOf(v));
  };
  this.isInteger = function (v) {
    return Math.floor(v)===v;
  };
  this.isNull = function (v) {
    return v === null;
  };
  this.isRecord = function (v) {
    return (typeof(v)==="object")
    && (typeof(v.$new)==="function")
    && (typeof(v.$clone)==="function")
    && (typeof(v.$eq)==="function")
    && (typeof(v.$assign)==="function");
  };
  this.isBigint = function (v) {
    return typeof(v) === 'bigint';
  };
  this.isUndefined = function (v) {
    return v == undefined;
  };
  this.isDefined = function (v) {
    return !(v == undefined);
  };
  this.isUTF16Char = function (v) {
    if (typeof(v)!="string") return false;
    if ((v.length==0) || (v.length>2)) return false;
    var code = v.charCodeAt(0);
    if (code < 0xD800){
      if (v.length == 1) return true;
    } else if (code <= 0xDBFF){
      if (v.length==2){
        code = v.charCodeAt(1);
        if (code >= 0xDC00 && code <= 0xDFFF) return true;
      };
    };
    return false;
  };
  this.jsInstanceOf = function (aFunction, aFunctionWithPrototype) {
    return aFunction instanceof aFunctionWithPrototype;
  };
  this.toNumber = function (v) {
    return v-0;
  };
  this.toInteger = function (v) {
    var Result = 0;
    if ($mod.isInteger(v)) {
      Result = rtl.trunc(v)}
     else Result = 0;
    return Result;
  };
  this.toObject = function (Value) {
    var Result = null;
    if (rtl.isObject(Value)) {
      Result = Value}
     else Result = null;
    return Result;
  };
  this.toArray = function (Value) {
    var Result = null;
    if (rtl.isArray(Value)) {
      Result = Value}
     else Result = null;
    return Result;
  };
  this.toBoolean = function (Value) {
    var Result = false;
    if ($mod.isBoolean(Value)) {
      Result = !(Value == false)}
     else Result = false;
    return Result;
  };
  this.ToString = function (Value) {
    var Result = "";
    if (rtl.isString(Value)) {
      Result = "" + Value}
     else Result = "";
    return Result;
  };
  this.JSClassName = function (aObj) {
    var Result = "";
    Result = "";
    if (aObj === null) return Result;
    return aObj.constructor.name;
    return Result;
  };
  $lt86 = this.TJSValueType = {"0": "jvtNull", jvtNull: 0, "1": "jvtBoolean", jvtBoolean: 1, "2": "jvtInteger", jvtInteger: 2, "3": "jvtFloat", jvtFloat: 3, "4": "jvtString", jvtString: 4, "5": "jvtObject", jvtObject: 5, "6": "jvtArray", jvtArray: 6};
  this.$rtti.$Enum("TJSValueType",{minvalue: 0, maxvalue: 6, ordtype: 1, enumtype: this.TJSValueType});
  this.GetValueType = function (JS) {
    var Result = 0;
    var t = "";
    if ($mod.isNull(JS)) {
      Result = 0}
     else {
      t = typeof(JS);
      if (t === "string") {
        Result = 4}
       else if (t === "boolean") {
        Result = 1}
       else if (t === "object") {
        if (rtl.isArray(JS)) {
          Result = 6}
         else Result = 5;
      } else if (t === "number") if ($mod.isInteger(JS)) {
        Result = 2}
       else Result = 3;
    };
    return Result;
  };
  this.HaveSharedArrayBuffer = function () {
    return (typeof SharedArrayBuffer !== 'undefined');
  };
  this.SharedToNonShared = function (aBuffer) {
    var Result = null;
    var Src = null;
    var Dest = null;
    if ($mod.HaveSharedArrayBuffer() && rtl.isExt(aBuffer,SharedArrayBuffer)) {
      Result = new ArrayBuffer(aBuffer.byteLength);
      Src = new Uint8Array(aBuffer);
      Dest = new Uint8Array(Result);
      Dest.set(Src);
    } else Result = aBuffer;
    return Result;
  };
  this.SharedToNonShared$1 = function (aArray, aWordSized) {
    var Result = null;
    var Buf = null;
    if ($mod.HaveSharedArrayBuffer() && rtl.isExt(aArray.buffer,SharedArrayBuffer)) {
      Buf = aArray.buffer.slice(aArray.byteOffset,aArray.byteOffset + aArray.byteLength);
      if (aWordSized) {
        Result = new Uint16Array($mod.SharedToNonShared(Buf))}
       else Result = new Uint8Array($mod.SharedToNonShared(Buf));
    } else Result = aArray;
    return Result;
  };
});
rtl.module("WebTinyNet",["System","JS"],function () {
  "use strict";
  var $mod = this;
  var $lt = null;
  var $lt1 = null;
  var $lt2 = null;
  var $lm = pas.System;
  var $lt3 = $lm.TObject;
  var $lp = $lm.Trunc;
  rtl.createClass(this,"TTable",$lt3,function () {
    $lt = this;
    this.$init = function () {
      $lt3.$init.call(this);
      this.Rows = 0;
      this.Cols = 0;
      this.Scale = null;
      this.W = null;
    };
    this.$final = function () {
      this.Scale = undefined;
      this.W = undefined;
      $lt3.$final.call(this);
    };
  });
  rtl.createClass(this,"TLayer",$lt3,function () {
    $lt1 = this;
    this.$init = function () {
      $lt3.$init.call(this);
      this.G1 = null;
      this.G2 = null;
      this.KS = null;
      this.VS = null;
      this.WQ = null;
      this.WK = null;
      this.WV = null;
      this.WO = null;
      this.F1 = null;
      this.F2 = null;
      this.KC = null;
      this.VC = null;
    };
    this.$final = function () {
      this.G1 = undefined;
      this.G2 = undefined;
      this.KS = undefined;
      this.VS = undefined;
      this.WQ = undefined;
      this.WK = undefined;
      this.WV = undefined;
      this.WO = undefined;
      this.F1 = undefined;
      this.F2 = undefined;
      this.KC = undefined;
      this.VC = undefined;
      $lt3.$final.call(this);
    };
  });
  rtl.createClass(this,"TTiny",$lt3,function () {
    $lt2 = this;
    this.$init = function () {
      $lt3.$init.call(this);
      this.View = null;
      this.Offset = 0;
      this.HD = 0;
      this.Divisor = 0.0;
      this.Emb = null;
      this.Pos = null;
      this.Layers = [];
      this.GF = null;
      this.X = null;
      this.BH = null;
      this.Q = null;
      this.T = null;
      this.A = null;
      this.M = null;
      this.S = null;
      this.D = 0;
      this.L = 0;
      this.H = 0;
      this.HID = 0;
      this.Score = null;
      this.Activity = null;
      this.Confidence = 0.0;
    };
    this.$final = function () {
      this.View = undefined;
      this.Emb = undefined;
      this.Pos = undefined;
      this.Layers = undefined;
      this.GF = undefined;
      this.X = undefined;
      this.BH = undefined;
      this.Q = undefined;
      this.T = undefined;
      this.A = undefined;
      this.M = undefined;
      this.S = undefined;
      this.Score = undefined;
      this.Activity = undefined;
      $lt3.$final.call(this);
    };
    this.Need = function (N) {
      if ((this.Offset + N) > this.View.byteLength) throw new Error("TINY.BIN is too short or damaged.");
    };
    this.Read16 = function () {
      var Result = 0;
      this.Need(2);
      Result = this.View.getUint16(this.Offset,true);
      this.Offset += 2;
      return Result;
    };
    this.ReadFloat = function () {
      var Result = 0.0;
      this.Need(4);
      Result = this.View.getFloat32(this.Offset,true);
      this.Offset += 4;
      if (!Number.isFinite(Result)) throw new Error("Invalid model weight.");
      return Result;
    };
    this.Gains = function () {
      var Result = null;
      var I = 0;
      Result = new Float32Array(this.D);
      for (var $l = 0, $end = this.D - 1; $l <= $end; $l++) {
        I = $l;
        Result[I] = this.ReadFloat();
      };
      return Result;
    };
    this.Table = function (Rows, Cols) {
      var Result = null;
      var R = 0;
      var C = 0;
      if ((Rows * Cols) > 65000) throw new Error("Model table too large.");
      Result = $lt.$create("Create");
      Result.Rows = Rows;
      Result.Cols = Cols;
      Result.Scale = new Float32Array(Rows);
      Result.W = new Int8Array(Rows * Cols);
      for (var $l = 0, $end = Rows - 1; $l <= $end; $l++) {
        R = $l;
        Result.Scale[R] = this.ReadFloat();
        this.Need(Cols);
        for (var $l1 = 0, $end1 = Cols - 1; $l1 <= $end1; $l1++) {
          C = $l1;
          Result.W[(R * Cols) + C] = this.View.getInt8(this.Offset + C);
        };
        this.Offset += Cols;
      };
      return Result;
    };
    this.Mat = function (TB, Input, Output) {
      var R = 0;
      var C = 0;
      var Sum = 0.0;
      for (var $l = 0, $end = TB.Rows - 1; $l <= $end; $l++) {
        R = $l;
        Sum = 0;
        for (var $l1 = 0, $end1 = TB.Cols - 1; $l1 <= $end1; $l1++) {
          C = $l1;
          Sum = Math.fround(Sum + Math.fround(TB.W[(R * TB.Cols) + C] * Input[C]));
        };
        Output[R] = Sum * TB.Scale[R];
      };
    };
    this.Norm = function (Input, Gain, Output) {
      var I = 0;
      var Sum = 0.0;
      var Z = 0.0;
      Sum = 0;
      for (var $l = 0, $end = this.D - 1; $l <= $end; $l++) {
        I = $l;
        Sum = Math.fround(Sum + Math.fround(Input[I] * Input[I]));
      };
      Z = Math.fround(1 / Math.sqrt(Math.fround(Sum / this.D) + 1e-5));
      for (var $l1 = 0, $end1 = this.D - 1; $l1 <= $end1; $l1++) {
        I = $l1;
        Output[I] = Math.fround(Input[I] * Z) * Gain[I];
      };
    };
    this.Store = function (Dest, P, Input) {
      var Result = 0.0;
      var I = 0;
      var Big = 0.0;
      var K = 0.0;
      var Z = 0.0;
      Big = 1e-20;
      for (var $l = 0, $end = this.D - 1; $l <= $end; $l++) {
        I = $l;
        if (Math.abs(Input[I]) > Big) Big = Math.abs(Input[I]);
      };
      K = Math.fround(127 / Big);
      for (var $l1 = 0, $end1 = this.D - 1; $l1 <= $end1; $l1++) {
        I = $l1;
        Z = Math.fround(Input[I] * K);
        if (Z < 0) {
          Dest[(P * this.D) + I] = $lp(Z - 0.5)}
         else Dest[(P * this.D) + I] = $lp(Z + 0.5);
      };
      Result = Math.fround(Big / 127);
      return Result;
    };
    this.FromBuffer = function (Buffer) {
      var I = 0;
      var B = null;
      this.View = new DataView(Buffer);
      this.Offset = 0;
      this.Need(12);
      if ((this.View.getUint8(0) !== 84) || (this.View.getUint8(1) !== 78) || (this.View.getUint8(2) !== 89) || (this.View.getUint8(3) !== 50)) throw new Error("Not a TINY version 2 model.");
      this.Offset = 4;
      this.D = this.Read16();
      this.L = this.Read16();
      this.H = this.Read16();
      this.HID = this.Read16();
      if ((this.D < 8) || (this.D > 128) || (this.L < 1) || (this.L > 8) || (this.H < 1) || (this.HID < 8) || (this.HID > 512)) throw new Error("Unsupported model dimensions.");
      if ((this.D % this.H) !== 0) throw new Error("Unsupported model dimensions.");
      this.HD = rtl.trunc(this.D / this.H);
      this.Divisor = Math.fround(Math.sqrt(this.HD));
      this.Emb = this.Table(97,this.D);
      this.Pos = this.Table(128,this.D);
      this.Layers = rtl.arraySetLength(this.Layers,null,this.L);
      for (var $l = 0, $end = this.L - 1; $l <= $end; $l++) {
        I = $l;
        B = $lt1.$create("Create");
        this.Layers[I] = B;
        B.G1 = this.Gains();
        B.WQ = this.Table(this.D,this.D);
        B.WK = this.Table(this.D,this.D);
        B.WV = this.Table(this.D,this.D);
        B.WO = this.Table(this.D,this.D);
        B.G2 = this.Gains();
        B.F1 = this.Table(this.HID,this.D);
        B.F2 = this.Table(this.D,this.HID);
        B.KC = new Int8Array(128 * this.D);
        B.VC = new Int8Array(128 * this.D);
        B.KS = new Float32Array(128);
        B.VS = new Float32Array(128);
      };
      this.GF = this.Gains();
      if (this.Offset !== this.View.byteLength) throw new Error("TINY.BIN has the wrong size.");
      this.X = new Float32Array(this.D);
      this.BH = new Float32Array(this.D);
      this.Q = new Float32Array(this.D);
      this.T = new Float32Array(this.D);
      this.A = new Float32Array(this.D);
      this.M = new Float32Array(this.HID);
      this.S = new Float32Array(128);
      this.Score = new Float32Array(97);
      this.Activity = new Float32Array(this.L);
      return this;
    };
    this.Step = function (Tok, P) {
      var I = 0;
      var J = 0;
      var LI = 0;
      var Head = 0;
      var Offs = 0;
      var B = null;
      var Sum = 0.0;
      var Big = 0.0;
      var Z = 0.0;
      var Act = 0.0;
      for (var $l = 0, $end = this.D - 1; $l <= $end; $l++) {
        I = $l;
        this.X[I] = Math.fround(this.Emb.W[(Tok * this.D) + I] * this.Emb.Scale[Tok]) + Math.fround(this.Pos.W[(P * this.D) + I] * this.Pos.Scale[P]);
      };
      for (var $l1 = 0, $end1 = this.L - 1; $l1 <= $end1; $l1++) {
        LI = $l1;
        B = this.Layers[LI];
        this.Norm(this.X,B.G1,this.BH);
        this.Mat(B.WK,this.BH,this.T);
        B.KS[P] = this.Store(B.KC,P,this.T);
        this.Mat(B.WV,this.BH,this.T);
        B.VS[P] = this.Store(B.VC,P,this.T);
        this.Mat(B.WQ,this.BH,this.Q);
        for (var $l2 = 0, $end2 = this.H - 1; $l2 <= $end2; $l2++) {
          Head = $l2;
          Big = -1e30;
          Offs = Head * this.HD;
          for (var $l3 = 0, $end3 = P; $l3 <= $end3; $l3++) {
            J = $l3;
            Sum = 0;
            for (var $l4 = 0, $end4 = this.HD - 1; $l4 <= $end4; $l4++) {
              I = $l4;
              Sum = Math.fround(Sum + Math.fround(this.Q[Offs + I] * B.KC[(J * this.D) + Offs + I]));
            };
            this.S[J] = Math.fround(Sum * B.KS[J]) / this.Divisor;
            if (this.S[J] > Big) Big = this.S[J];
          };
          Sum = 0;
          for (var $l5 = 0, $end5 = P; $l5 <= $end5; $l5++) {
            J = $l5;
            this.S[J] = Math.exp(Math.fround(this.S[J] - Big));
            Sum = Math.fround(Sum + this.S[J]);
          };
          for (var $l6 = 0, $end6 = this.HD - 1; $l6 <= $end6; $l6++) {
            I = $l6;
            this.A[Offs + I] = 0;
          };
          for (var $l7 = 0, $end7 = P; $l7 <= $end7; $l7++) {
            J = $l7;
            Z = Math.fround(Math.fround(this.S[J] * B.VS[J]) / Sum);
            for (var $l8 = 0, $end8 = this.HD - 1; $l8 <= $end8; $l8++) {
              I = $l8;
              this.A[Offs + I] = Math.fround(this.A[Offs + I] + Math.fround(Z * B.VC[(J * this.D) + Offs + I]));
            };
          };
        };
        this.Mat(B.WO,this.A,this.T);
        for (var $l9 = 0, $end9 = this.D - 1; $l9 <= $end9; $l9++) {
          I = $l9;
          this.X[I] = this.X[I] + this.T[I];
        };
        this.Norm(this.X,B.G2,this.BH);
        this.Mat(B.F1,this.BH,this.M);
        Act = 0;
        for (var $l10 = 0, $end10 = this.HID - 1; $l10 <= $end10; $l10++) {
          I = $l10;
          if (this.M[I] < 0) this.M[I] = 0;
          Act = Math.fround(Act + this.M[I]);
        };
        this.Activity[LI] = Act / this.HID;
        this.Mat(B.F2,this.M,this.T);
        for (var $l11 = 0, $end11 = this.D - 1; $l11 <= $end11; $l11++) {
          I = $l11;
          this.X[I] = this.X[I] + this.T[I];
        };
      };
      this.Norm(this.X,this.GF,this.BH);
      this.Mat(this.Emb,this.BH,this.Score);
    };
    this.Pick = function (Creativity) {
      var Result = 0;
      var I = 0;
      var Best = 0;
      var Tok = 0;
      var Sum = 0.0;
      var R = 0.0;
      Best = 0;
      for (I = 1; I <= 96; I++) if (this.Score[I] > this.Score[Best]) Best = I;
      Tok = Best;
      if (Creativity > 0) {
        Sum = 0;
        for (I = 0; I <= 96; I++) {
          this.S[I] = Math.exp((this.Score[I] - this.Score[Best]) / (Creativity / 5));
          if (this.S[I] < 0.15) this.S[I] = 0;
          Sum = Sum + this.S[I];
        };
        R = Math.random() * Sum;
        for (I = 0; I <= 96; I++) {
          R = R - this.S[I];
          if (R < 0) {
            Tok = I;
            break;
          };
        };
      };
      Sum = 0;
      for (I = 0; I <= 96; I++) Sum = Sum + Math.exp(this.Score[I] - this.Score[Tok]);
      this.Confidence = 1 / Sum;
      Result = Tok;
      return Result;
    };
    var $r = this.$rtti;
    $mod.$rtti.$DynArray("TTiny.Layers$a",{eltype: $mod.$rtti["TLayer"]});
  });
});
rtl.module("program",["System"],function () {
  "use strict";
  var $mod = this;
  $mod.$main = function () {
  };
});

// ES module boundary added by scripts/build_pascal.py
rtl.run("WebTinyNet");
export const PascalTiny = pas.WebTinyNet.TTiny;
