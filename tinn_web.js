/*
Copyright (c) 2020 TINN Web by Saverio Castellano. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
*/

class RequestControllerExit extends Error {
  constructor(message) {
    super(message); // (1)
    this.name = "RequestControllerExit"; // (2)
  }
}

class PageNotFound extends Error {
  constructor(message) {
    super(message); // (1)
    this.name = "PageNotFound"; // (2)
  }
}

var RequestController = new function() 
{	
	this.DEFAULT_PAGE = 'index.html';
	this._requests = {};
	this._pageEnv = ['echo', 'exit', 'url', 'include', 'includeOnce', 'setHeader', 'getHeader', 'getHeaders', 'getParam', 'getParams'];
	this._httpEnv = [
		'GATEWAY_INTERFACE',
		'SERVER_SOFTWARE',
		'QUERY_STRING',
		'REQUEST_METHOD',
		'CONTENT_TYPE',     
        'CONTENT_LENGTH',   
        'SCRIPT_FILENAME',   
        'SCRIPT_NAME',        
        'REQUEST_URI' ,       
        'DOCUMENT_URI' ,    
        'DOCUMENT_ROOT' ,    
        'SERVER_PROTOCOL',    
        'REMOTE_ADDR',        
        'REMOTE_PORT',       
        'SERVER_ADDR',       
        'SERVER_PORT',      
        'SERVER_NAME', 		
	];
	
	this._globalBkp = {};
	this._pageRoots = [];	
	this.PageNotFound = PageNotFound;
	
	this._setup = function() {
		for (var i=0; i<this._httpEnv.length;i++) {
			var name = this._httpEnv[i];
			var func = 'get';
			for (var j=0; j<name.length;j++){
				var c = name.charAt(j);
				if (c=='_')continue;
				func += j==0 ? c : (name.charAt(j-1)=='_' ? c : c.toLowerCase());
			}
			this[func] = Function('','return Http.getParam("'+name+'")');
			this._pageEnv.push(func);
		}
	}
	
	this.getContentType = function() {
		
	}
	
	this._defaultRequestController = function(){
		
		var requestKey = '';
		if (typeof(this._requestPath)=='undefined') return;
		var reqParts = this._requestPath.split('/');
		for (var i=0; i<reqParts.length; i++)
		{
		   if (reqParts[i]=='') continue;
		   var reqPart = reqParts[i].split(".")[0];
		   requestKey += reqPart.charAt(0).toUpperCase()+reqPart.substring(1).toLowerCase();
		   if (!this._processRequest(requestKey)) break;
		} 	
	}
	
	this._requestControllers = [this._defaultRequestController];		
		
	this._getCacheDir = function(){ 
		if (!this.CACHE_DIR) {
			this.CACHE_DIR = path.resolve(RequestController.getServerRoot(), 'cache');
		}
		return this.CACHE_DIR;
	}	
		
	this.getServerRoot = function()
	{
		if (!this._cwd)
		{
			this._cwd = path.resolve(path.dirname(process.mainModule.filename));	
		}
		return this._cwd;
	}

	this._getCachedPage = function(pagePath)
	{
		var cachePath = RequestController._getCachePagePath(pagePath);
		if (OS.isFileAndReadable(cachePath) && OS.lastModifiedTime(cachePath) >= OS.lastModifiedTime(pagePath)) {
			return OS.readFile(cachePath);
		}
		return null;
	}
	
	this._sanitizeEvalInput = function (string) {
		return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
		switch (character) {
		  case '"':
		  case "'":
		  case '\\':
			return '\\' + character
		  case '\n':
			return '\\n'
		  case '\r':
			return '\\r'
		  case '\u2028':
			return '\\u2028'
		  case '\u2029':
			return '\\u2029'
		  }
		});
	}	

	this._preparePageEnv = function(){ 
		this._globalBkp = {};
		for (var i=0; i<this._pageEnv.length; i++) {
			if (!global[this._pageEnv[i]]) this._globalBkp[this._pageEnv[i]] = global[this._pageEnv[i]];
			global[this._pageEnv[i]] = RequestController[this._pageEnv[i]];
		}
	}
	
	this._undoPageEnv = function() {
		for (var what in this._globalBkp) {
			global[what] = this._globalBkp[what];
		}		
	}
	
	
	this._runCachedPage = function(pagePath)
	{
		try {
			RequestController._preparePageEnv();
			JS.load(RequestController._getCachePagePath(pagePath), pagePath);
			RequestController._undoPageEnv();
		} catch(e){
			RequestController._undoPageEnv();
			throw e;
		}		
	}
	
	this.addPageRoot = function(urlpath, dir) {
		this._pageRoots.push([urlpath, dir]);
	}
	
	this._getPagePath = function(page){ 
		for (var i=0; i<this._pageRoots.length; i++){
			if (page.indexOf(this._pageRoots[i][0])==0) {
				if (typeof(this._pageRoots[i][1])=='function') {
					var retVal = this._pageRoots[i][1].call(this, page);  
					if (retVal) return retVal
				} else {
					return this._pageRoots[i][1]+page.substr(this._pageRoots[i][0].length);
				}
			}
		}
		return path.resolve(RequestController.getServerRoot(), 'pages', page);
	}
	
	this._handleSubPage = function(pagePath, once){
		if (once) this.pageIncludes.push(pagePath);
		this.pageStack.push(pagePath);
		var cachedPage = RequestController._getCachedPage(pagePath);
		if (cachedPage)
		{			
			RequestController._runCachedPage.call(this.pageCtx, pagePath);
		} else if (OS.isFileAndReadable(pagePath))	
		{
			var pageOut = '';
			
			try {

				//render page and run
				var pageContent = OS.readFile(pagePath);
				var inJs = false;							
				var inPrintJs = false;
				
				do {
					var tag = inJs ? '?>' : '<?js';
					var _iStart = pageContent.indexOf(tag);
					if (!inJs) {
						inPrintJs = false;
						var printJsStart = pageContent.indexOf('<?=');
						if (printJsStart != -1 && (_iStart==-1 || printJsStart <_iStart)) {
							inPrintJs = true;
							_iStart = printJsStart;
							tag = '<?=';
						}
					}
					if (_iStart == -1) {
						if (inJs) throw new Error("missing closing of script tag in " + pagePath);
						_iStart = pageContent.length;	
					}
					if (!inJs) {
						var lines = pageContent.substr(0, _iStart).split("\n");
						for (var i=0; i<lines.length;i++) {
							pageOut += "echo('" + RequestController._sanitizeEvalInput(lines[i]) + (i!=lines.length-1? "\\n');\n" : "');");
						}
					} else {
						if (inPrintJs)	{
							pageOut += "echo("+pageContent.substr(0, _iStart)+"+\'\');";
						} else {
							pageOut += pageContent.substr(0, _iStart);
						}
					}
					inJs = !inJs;
					pageContent = pageContent.substr(_iStart + (_iStart==-1 ? 0 : tag.length));
						
				} while(pageContent.length > 0);
				
				
			} catch (e)
			{	
				throw new Error("page render error: " + e.message);
			}
			
			RequestController._cachePage(pagePath, pageOut);
			RequestController._runCachedPage.call(this.pageCtx, pagePath);
			
			
		} else {
			throw new PageNotFound('page not found: ' + pagePath);
		}		
	
	}
	
	this._getCachePagePath = function(page) {
		var root = RequestController.getServerRoot();
		var cacheDir = RequestController._getCacheDir();
		page = page.substr(root.length+1);
		return path.resolve(cacheDir, page);
	}
	
	this._cachePage = function(page, content) {
		var dst = RequestController._getCachePagePath(page);
		//create dirs if neededed
		if (!OS.isDirAndReadable(path.dirname(dst))) {
			if (OS.mkpath(path.dirname(dst))==-1) {
				throw new Error('Error creating cache directory: ' + path.dirname(dst));
			}
		}
		OS.writeFile(dst, content);
	}
	
	this._reportPageError = function(e, halt) {
		
		if (typeof(this._errorHandler)!='undefined')
		{
			try{
				this._errorHandler.call(this, e);
			} catch (err) {
				this.response("error in error handler: " + err + ". Original error: " + e.stack);
			}
			if (halt) {
				RequestController.exit();
			}				
		} else 
		{
			if (e.stack && !(e instanceof RequestControllerExit)) this.response('<pre>'+e.stack + "</pre>");  
			if (halt) {
				RequestController.exit();
			}			
		}						
	}	
	
	this._handlePage = function()
	{
		try {
			delete this.pageExit;
			delete this.pageError;
			delete this.pageStack;
			
			this.pageStack = [];
			this.pageIncludes = [];
			this._headers['Content-type'] = 'text/html';
			this.pageCtx = {};
			
			var pagePath = this._getPagePath(this._requestPath.replace(/\//g, path.sep).substring(1));
			var pageName = pagePath.split(path.sep).reverse()[0];
			if (OS.isDirAndReadable(pagePath) && OS.isFileAndReadable(path.resolve(pagePath, 'index.html'))) {
				pagePath = path.resolve(pagePath, this.DEFAULT_PAGE);
				pageName = this.DEFAULT_PAGE;
			}
			var ext = (pageName.indexOf(".") == -1 ? '' : pageName.split(".")[1]).toLowerCase();
			RequestController._handleSubPage(pagePath, false, true);
		} catch(e) {
			RequestController._reportPageError(e, true);
		}
	}
	
	this._handleScript = function()
	{
		for (var i=0; i<this._requestControllers.length; i++){
			this._requestControllers[i].call(RequestController);			
		}
	}	
	
	this.writeResponse = function(){ 
		if (this._sent === true) return;
		Http.print("Status: "+this._statusCode + (typeof(this._statusText)!='undefined'? ' ' + this._statusText : '')+"\r\n");
		if (typeof(this._headers['Content-Length'])=='undefined') this._headers['Content-Length'] = this._response.length;
		for (var hdr in this._headers) {
			Http.print(hdr+": "+this._headers[hdr]+"\r\n");
		}
		if (this._response != '') { 
			Http.print("\r\n"+this._response);
		} else {
			Http.print("\r\n");
		}
		this._sent = true;
	}	
	
	this.responseStatus = function(code, text) {
		if (isNaN(code)) throw new Error("invalid reponse status code: " + code);
		this._statusCode = code;
		if (this._statusCode != 200) {
			delete this._statusText;
		}
		if (typeof(text)!='undefined') {
			this._statusText = text;
		}
	}
	
	this.handleRequest = function() 
	{		
		//delete this._errorHandler;
		delete this._sent;
		this._isScript = false;
		this._headers = {};
		this._response = '';
		this._statusCode = 200;
		this._statusText = 'OK';
		this._requestPath = Http.getParam("SCRIPT_NAME");
		this._qStr = {};
		var qStrParts = Http.getParam('QUERY_STRING','').split("&");
		for (var i=0; i<qStrParts.length;i++) {
			var q = qStrParts[i].split('=');
			this._qStr[q[0]] = q[1];	
		}
		var start = Date.now();
		
		this._handleScript();
		
		if (!this._isScript) {
			try {
				this._handlePage();
			}catch(e) {
				RequestController.writeResponse();
				return;
			}
		}
		
		this.writeResponse();
	}

	this.addRequestHandler = function(name, func) {
		this._requests[name] = func;
	}

	this.getRequestHandlers = function(name, func) {
		return this._requests;
	}

	this.getRequestControllers = function() {
		return this._requestControllers;
	}	
		
	this._processRequest = function(requestName) {
	    if (typeof(this._requests[requestName])!='function') return true;
		this._isScript = true;

		try {
			
			this._requests[requestName].call(this);
			
		} catch (e) {
			if (typeof(this._errorHandler)!='undefined')
			{
				try {
					this._errorHandler.call(this, e);
				} catch (err) {
					RequestController.printErrorIfNeeded(err);
				}
			} else 
			{
			   RequestController.printErrorIfNeeded(e);			   						
			}						
			return false;
		}		
		return true;
	}	
	
	this.response = function(txt, clear) {
		if (clear === true) this._response = '';
		this._response += txt;
	}

	this.getPageStack = function() {
		return  this.pageStack;
	}
	
	this.getPagePath = function() {
		return this.pageStack[this.pageStack.length-1];
	}

	this.require = function(page, once, haltOnErrors){
		var rc = RequestController;
		var current = rc.pageStack[rc.pageStack.length-1];
		var pagePath = path.resolve(path.dirname(current), page);
		if (once && this.pageIncludes.indexOf(pagePath)!=-1) {
			return;
		}
		try {
			RequestController._handleSubPage(pagePath, once);
		} catch(e) {
			RequestController._reportPageError(e, haltOnErrors);
		}
		rc.pageStack.pop();
	}	
	
	this.printErrorIfNeeded = function(e)
	{
	   if (!(e instanceof RequestControllerExit))
	   {
		   RequestController.responseStatus(200, 'OK');
		   RequestController.response("Error: "+e.stack+''+e.message, true);
		   RequestController.writeResponse();
		   return true;
	   } else {
		   RequestController.writeResponse();
	   }
	   return false;
	}	
	
	this.setErrorHandler = function(func) {
		this._errorHandler = func;	
	}
	
	this.setHeader = function(name, val) {
		RequestController.pageHeaders[name] = val;
	}
	
	this.getHeaders = function() {
		var params = Http.getParams();
		var headers = {};
		var HTTP_ = 'HTTP_';
		for (var i=0; i<params.length; i++) {
			var eq =  params[i].indexOf('=');
			var name = params[i].substring(0, eq);
			var st = name.indexOf(HTTP_);
			if (st==0) {
				name = name.substring(HTTP_.length).replace(/_/g,"-");
				var hdr = '';
				for (var j=0; j<name.length; j++) {
					var c = name.charAt(j)
					hdr += j==0 ? c : (name.charAt(j-1)=='-' ? c : c.toLowerCase()); 
				}		
				headers[hdr] = params[i].substring(eq+1);
			}
		}
		return headers;
	}

	this.getHeader = function(name){ 
		name = 'HTTP_' + name.replace('-','_').toUpperCase();
		return Http.getParam(name);
	}	

	this.getParam = function(name) {
		return RequestController._qStr[name];
	}

	this.getParams = function(name) {
		return RequestController._qStr;
	}

	//page functions
	
	this.url = function(txt) {
		var sc = RequestController.getScriptName();
		return sc.substring(0, sc.lastIndexOf('/'))+'/'+txt;
	}	

	this.exit = function() {
		throw new RequestControllerExit('');
	}
	
	this.echo = function(txt) {
		RequestController.response.call(RequestController, txt);
	}
	
	this.include = function(what, required){ 
		RequestController.require(what, false, required);
	}
	
	this.includeOnce = function(what, required){ 
		RequestController.require(what, true, required);
	}
	
}
	
RequestController._setup();

module.exports = RequestController;

