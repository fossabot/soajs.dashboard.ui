"use strict";


soajsApp.service('ngDataApi', ['$http', '$cookies', '$localStorage', 'Upload', function ($http, $cookies, $localStorage, Upload) {
	
	function logoutUser(scope) {
		$cookies.remove('soajs_username', { 'domain': interfaceDomain });
		$cookies.remove('access_token', { 'domain': interfaceDomain });
		$cookies.remove('refresh_token', { 'domain': interfaceDomain });
		$cookies.remove('soajs_dashboard_key', { 'domain': interfaceDomain });
		$cookies.remove('myEnv', { 'domain': interfaceDomain });
		$cookies.remove('soajsID', { 'domain': interfaceDomain });
		$cookies.remove('soajs_auth', { 'domain': interfaceDomain });
		$cookies.remove('soajs_current_route', { 'domain': interfaceDomain });
		$cookies.remove('selectedInterval', { 'domain': interfaceDomain });
		$cookies.remove("soajs_dashboard_login", { 'domain': interfaceDomain });
		
		$localStorage.soajs_user = null;
		$localStorage.acl_access = null;
		$localStorage.environments = null;
		scope.$parent.enableInterface = false;
	}
	
	function revalidateTokens(scope, config, cb) {
		//create a copy of old config
		var myDomain = config.url.replace(/http(s)?:\/\//, '');
		myDomain = myDomain.split("/")[0];
		myDomain = protocol + "//" + myDomain;
		
		//first authorize
		var reAuthorizeConfig = angular.copy(config);
		reAuthorizeConfig.method = 'GET';
		reAuthorizeConfig.url = myDomain + "/oauth/authorization";
		reAuthorizeConfig.headers.key = apiConfiguration.key;
		reAuthorizeConfig.headers.accept = "*/*";
		delete reAuthorizeConfig.headers.Authorization;
		delete reAuthorizeConfig.params;
		
		$http(reAuthorizeConfig).success(function (response) {
			
			//second get new tokens.
			var authValue = response.data;
			var getNewAccessToken = angular.copy(config);
			getNewAccessToken.method = 'POST';
			getNewAccessToken.url = myDomain + "/oauth/token";
			getNewAccessToken.headers.Authorization = authValue;
			delete getNewAccessToken.params;
			getNewAccessToken.data = {
				'refresh_token': $cookies.get('refresh_token', { 'domain': interfaceDomain }),
				'grant_type': "refresh_token"
			};
			
			$http(getNewAccessToken).success(function (response) {
				$cookies.put('access_token', response.access_token, { 'domain': interfaceDomain });
				$cookies.put('refresh_token', response.refresh_token, { 'domain': interfaceDomain });
				
				//repeat the main call
				var MainAPIConfig = angular.copy(config);
				MainAPIConfig.params.access_token = $cookies.get('access_token', { 'domain': interfaceDomain });
				$http(MainAPIConfig).success(function (response, status, headers, config) {
					returnAPIResponse(scope, response, config, cb)
				}).error(function (errData, status, headers, config) {
					//logout the user
					logoutUser(scope);
					returnErrorOutput(config, status, headers, config, cb)
				});
			}).error(function (errData, status, headers, config) {
				//logout the user
				logoutUser(scope);
				returnErrorOutput(config, status, headers, config, cb)
			});
		}).error(function (errData, status, headers, config) {
			//logout the user
			logoutUser(scope);
			returnErrorOutput(config, status, headers, config, cb)
		});
	}
	
	function returnErrorOutput(opts, status, headers, config, cb) {
		console.log(status, headers, config);
		return cb(new Error("Unable Fetching data from " + config.url));
	}
	
	function returnAPIError(scope, opts, status, headers, errData, config, cb) {
		//try to get a new access token from the refresh
		if (errData && errData.errors && errData.errors.details[0].code === 401 && ["The access token provided is invalid.", "The access token provided has expired."].indexOf(errData.errors.details[0].message) !== -1) {
			revalidateTokens(scope, config, cb);
		}
		else {
			if (errData && errData.errors) {
				return cb(new Error(errData.errors.details[0].code + ":" + errData.errors.details[0].message));
			}
			else {
				returnErrorOutput(opts, status, headers, config, cb)
			}
		}
	}
	
	function returnAPIResponse(scope, response, config, cb) {
		if (config.responseType === 'arraybuffer' && response) {
			try {
				var res = String.fromCharCode.apply(null, new Uint8Array(response));
				if (typeof res !== 'object') {
					res = JSON.parse(res);
				}
				if (res.result === false) {
					var str = '';
					for (var i = 0; i < res.errors.details.length; i++) {
						str += "Error[" + res.errors.details[i].code + "]: " + res.errors.details[i].message;
					}
					var errorObj = {
						message: str,
						codes: res.errors.codes,
						details: res.errors.details
					};
					if (res.errors.codes && res.errors.codes[0]) {
						errorObj.code = res.errors.codes[0];
					}
					return cb(errorObj);
				}
				else {
					return cb(null, response);
				}
			}
			catch (e) {
				console.log("Unable to parse arraybuffer response. Possible reason: response is a stream and too large.");
				return cb(null, response);
			}
		}
		else if (response && !Object.hasOwnProperty.call(response, "result")) {
			return cb(null, response);
		}
		else if (response && response.result === true) {
			if (response.soajsauth && $cookies.get('soajs_auth', { 'domain': interfaceDomain })) {
				$cookies.put("soajs_auth", response.soajsauth, { 'domain': interfaceDomain });
			}
			var resp = {};
			for (var i in response) {
				resp[i] = response[i];
			}
			if (resp.data) {
				if (typeof(resp.data) !== 'object') {
					if (typeof(resp.data) === 'string') {
						resp.data = {
							data: resp.data
						};
					}
					else {
						resp.data = {};
					}
				}
			}
			else {
				resp.data = {};
			}
			resp.data.soajsauth = resp.soajsauth;
			return cb(null, resp.data);
		}
		else {
			//try to refresh the access token before logging out the user
			if (response.errors.details[0].code === 401 && ["The access token provided is invalid.", "The access token provided has expired."].indexOf(response.errors.details[0].message) !== -1) {
				revalidateTokens(scope, config, cb);
			}
			else {
				var str = '';
				for (var i = 0; i < response.errors.details.length; i++) {
					str += "Error[" + response.errors.details[i].code + "]: " + response.errors.details[i].message;
				}
				var errorObj = {
					message: str,
					codes: response.errors.codes,
					details: response.errors.details
				};
				if (response.errors.codes && response.errors.codes[0]) {
					errorObj.code = response.errors.codes[0];
				}
				return cb(errorObj);
			}
		}
	}
	
	function executeRequest(scope, opts, cb) {
		var config = {
			token: opts.token,
			url: opts.url,
			method: opts.method,
			params: opts.params || {},
			xsrfCookieName: opts.cookie || "",
			cache: opts.cache || false,
			timeout: opts.timeout || 60000,
			responseType: opts.responseType || 'json',
			headers: opts.headers || {},
			data: opts.data || {},
			json: true
		};
		
		var soajsAuthCookie = $cookies.get('soajs_auth', { 'domain': interfaceDomain });
		if (soajsAuthCookie && soajsAuthCookie.indexOf("Basic ") !== -1) {
			config.headers.soajsauth = soajsAuthCookie.replace(/\"/g, '');
		}
		
		if (opts.headers.key) {
			config.headers.key = opts.headers.key;
		}
		else if ($cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain })) {
			config.headers.key = $cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain }).replace(/\"/g, '');
		}
		else {
			config.headers.key = apiConfiguration.key;
		}
		
		var access_token = $cookies.get('access_token', { 'domain': interfaceDomain });
		if (access_token && config.token) {
			config.params.access_token = access_token;
		}
		var project = $cookies.get('soajs_project', { 'domain': interfaceDomain });
		if (project) {
			config.params.soajs_project = project;
		}
		
		if (opts.proxy) {
			if (!config.params.__env) {
				var env;
				if ($cookies.getObject('myEnv', { 'domain': interfaceDomain })) {
					env = $cookies.getObject('myEnv', { 'domain': interfaceDomain }).code;
					config.params.__env = env.toUpperCase();
				}
				else {
					console.log("Missing Env object");
				}
			}
		}
		
		if (opts.jsonp === true) {
			config.url += (config.url.indexOf('?') === -1) ? '?' : '&';
			config.url += "callback=JSON_CALLBACK";
			config.method = (config.method.toLowerCase() === 'get') ? 'jsonp' : config.method;
		}
		
		if (opts.upload) {
			config.progress = {
				value: 0
			};
			if (opts.file) {
				config.file = opts.file;
			}
			else {
				console.log('Missing File for Upload');
			}
			Upload.upload(config).progress(function (evt) {
				var progressPercentage = parseInt(100.0 * evt.loaded / evt.total);
				config.progress.value = progressPercentage;
			}).success(function (response, status, headers, config) {
				returnAPIResponse(scope, response, config, cb);
			}).error(function (data, status, header, config) {
				returnAPIError(scope, opts, status, headers, data, config, cb);
			});
		}
		else {
			$http(config).success(function (response, status, headers, config) {
				returnAPIResponse(scope, response, config, cb);
			}).error(function (errData, status, headers, config) {
				returnAPIError(scope, opts, status, headers, errData, config, cb);
			});
		}
		
	}
	
	function getData(scope, opts, cb) {
		opts.method = 'GET';
		opts.api = 'getData';
		executeRequest(scope, opts, cb);
	}
	
	function sendData(scope, opts, cb) {
		opts.method = 'POST';
		opts.api = 'sendData';
		executeRequest(scope, opts, cb);
	}
	
	function putData(scope, opts, cb) {
		opts.method = 'PUT';
		opts.api = 'putData';
		executeRequest(scope, opts, cb);
	}
	
	function delData(scope, opts, cb) {
		opts.method = 'DELETE';
		opts.api = 'delData';
		executeRequest(scope, opts, cb);
	}
	
	return {
		'get': getData,
		'send': sendData,
		'post': sendData,
		'put': putData,
		'del': delData,
		'delete': delData,
		'logoutUser': logoutUser
	};
}]);

soajsApp.service('isUserLoggedIn', ['$cookies', '$localStorage', 'ngDataApi', function ($cookies, $localStorage, ngDataApi) {
	return function (currentScope) {
		if ($cookies.get('soajs_username', { 'domain': interfaceDomain }) && $cookies.get('access_token', { 'domain': interfaceDomain })) {
			return true;
		}
		else {
			ngDataApi.logoutUser(currentScope);
			return false;
		}
	}
}]);

soajsApp.service('checkApiHasAccess', function () {
	
	return function (aclObject, serviceName, routePath, method, userGroups, callback) {
		var environments = Object.keys(aclObject);
		return validateAccess(environments, 0, callback);
		
		function validateAccess(environments, i, cb) {
			var envCode = environments[i].toLowerCase();
			
			if (!aclObject[envCode] || !aclObject[envCode][serviceName]) {
				i++;
				if (i === environments.length) {
					return cb(false);
				}
				else {
					validateAccess(environments, i, cb);
				}
			}
			else {
				var system = aclObject[envCode][serviceName];
				if (system) {
					var access = checkSystem(system);
					return cb(access);
				}
				else {
					return cb(false);
				}
			}
		}
		
		function checkSystem(system) {
			function getAclObj(aclObj) {
				if (aclObj && (aclObj.apis || aclObj.apisRegExp)) {
					return aclObj;
				}
				if (method) {
					if (aclObj[method] && typeof aclObj[method] === "object") {
						var newAclObj = {};
						if (aclObj.hasOwnProperty('access')) {
							newAclObj.access = aclObj.access;
						}
						if (aclObj[method].hasOwnProperty('apis')) {
							newAclObj.apis = aclObj[method].apis;
						}
						if (aclObj[method].hasOwnProperty('apisRegExp')) {
							newAclObj.apisRegExp = aclObj[method].apisRegExp;
						}
						if (aclObj[method].hasOwnProperty('apisPermission')) {
							newAclObj.apisPermission = aclObj[method].apisPermission;
						}
						else if (aclObj.hasOwnProperty('apisPermission')) {
							newAclObj.apisPermission = aclObj.apisPermission;
						}
						return newAclObj;
					}
					else {
						return aclObj;
					}
				}
				else {
					return aclObj;
				}
			}
			
			system = getAclObj(system);
			
			var api = (system && system.apis ? system.apis[routePath] : null);
			
			if (!api && system && system.apisRegExp && Object.keys(system.apisRegExp).length) {
				for (var jj = 0; jj < system.apisRegExp.length; jj++) {
					if (system.apisRegExp[jj].regExp && routePath.match(system.apisRegExp[jj].regExp)) {
						api = system.apisRegExp[jj];
						break;
					}
				}
			}
			if (Object.hasOwnProperty.call(system, 'access')) {
				if (Array.isArray(system.access)) {
					var checkAPI = false;
					if (userGroups) {
						for (var ii = 0; ii < userGroups.length; ii++) {
							if (system.access.indexOf(userGroups[ii]) !== -1) {
								checkAPI = true;
								break;
							}
						}
					}
					if (!checkAPI) {
						return false;
					}
				}
				return api_checkPermission(system, userGroups, api);
			}
			
			if (api || (system && system.apisPermission === 'restricted')) {
				return api_checkPermission(system, userGroups, api);
			}
			else {
				return true;
			}
		}
		
		function api_checkPermission(system, userGroups, api) {
			if ('restricted' === system.apisPermission) {
				if (!api) {
					return false;
				}
				return api_checkAccess(api.access, userGroups);
			}
			if (!api) {
				return true;
			}
			
			return api_checkAccess(api.access, userGroups);
		}
		
		function api_checkAccess(apiAccess, userGroups) {
			if (!apiAccess) {
				return true;
			}
			
			if (apiAccess instanceof Array) {
				if (!userGroups) {
					return false;
				}
				
				var found = false;
				for (var ii = 0; ii < userGroups.length; ii++) {
					if (apiAccess.indexOf(userGroups[ii]) !== -1) {
						found = true;
						break;
					}
				}
				return found;
			}
			else {
				return true;
			}
		}
	}
});

soajsApp.service("injectFiles", function () {
	
	function injectCss(filePath) {
		var csstag = "<link rel='stylesheet' type='text/css' href='" + filePath + "' />";
		jQuery("head").append(csstag);
	}
	
	return {
		'injectCss': injectCss
	}
});

soajsApp.service("aclDrawHelpers", function () {
	
	function groupApisForDisplay(apisArray, apiGroupName) {
		var result = {};
		var defaultGroupName = 'General';
		var len = (apisArray) ? apisArray.length : 0;
		if (len === 0) {
			return result;
		}
		for (var i = 0; i < len; i++) {
			if (apisArray[i][apiGroupName]) {
				defaultGroupName = apisArray[i][apiGroupName];
			}
			
			if (!result[defaultGroupName]) {
				result[defaultGroupName] = {};
				result[defaultGroupName].apis = [];
				if (apisArray[i].m) {
					result[defaultGroupName].apisRest = {};
				}
			}
			if (!apisArray[i].m) {
				//apisArray[i].m = 'all';
			}
			if (apisArray[i].m) {
				if (!result[defaultGroupName].apisRest[apisArray[i].m]) {
					result[defaultGroupName].apisRest[apisArray[i].m] = [];
				}
				result[defaultGroupName].apisRest[apisArray[i].m].push(apisArray[i]);
			}
			if (apisArray[i].groupMain === true) {
				result[defaultGroupName]['defaultApi'] = apisArray[i].v;
			}
			result[defaultGroupName].apis.push(apisArray[i]);
		}
		
		return result;
	}
	
	function applyApiRestriction(aclFill, service) {
		if (service.name) {
			var aclService = aclFill[service.name];
		}
		if (aclService && aclService.apisRestrictPermission === true) {
			for (var grpLabel in service.fixList) {
				if (service.fixList.hasOwnProperty(grpLabel)) {
					var defaultApi = service.fixList[grpLabel]['defaultApi'];
					if (defaultApi) {
						var found = false;
						if (service.fixList[grpLabel].apisRest) {
							for (var m in service.fixList[grpLabel].apisRest) {
								if (aclService[m]) {
									if (aclService[m].apis && aclService[m].apis[defaultApi] && aclService[m].apis[defaultApi].include === true) {
										found = true;
										break;
									}
								}
							}
							if (!found) {
								for (var m in service.fixList[grpLabel].apisRest) {
									if (aclService[m]) {
										service.fixList[grpLabel].apisRest[m].forEach(function (oneApi) {
											if (aclService[m].apis && aclService[m].apis[oneApi.v]) {
												aclService[m].apis[oneApi.v].include = false;
											}
										});
									}
								}
							}
						}
						else if (aclService.apis) {
							if ((!aclService.apis[defaultApi]) || aclService.apis[defaultApi].include !== true) {
								service.fixList[grpLabel]['apis'].forEach(function (oneApi) {
									if (aclService.apis[oneApi.v]) {
										aclService.apis[oneApi.v].include = false;
									}
								});
							}
						}
						service.fixList[grpLabel].defaultIncluded = found;
					}
				}
			}
		}
	}
	
	function checkForGroupDefault(aclFill, service, grp, val, myApi) {
		var defaultApi = service.fixList[grp]['defaultApi'];
		var found = true;
		if (myApi.groupMain === true) {
			if (val.apisRest && myApi.m) {
				if (aclFill[service.name][myApi.m].apis) {
					if (aclFill[service.name][myApi.m].apis[defaultApi] && aclFill[service.name][myApi.m].apis[defaultApi].include !== true) {
						found = false;
						for (var m in val.apisRest) {
							if (aclFill[service.name][m]) {
								val.apisRest[m].forEach(function (one) {
									if (aclFill[service.name][m].apis[one.v]) {
										aclFill[service.name][m].apis[one.v].include = false;
									}
								});
							}
						}
					}
				}
			}
			else if (aclFill[service.name].apis) {
				if ((aclFill[service.name].apis[defaultApi]) && aclFill[service.name].apis[defaultApi].include !== true) {
					found = false;
					val.apis.forEach(function (one) {
						if (aclFill[service.name].apis[one.v]) {
							aclFill[service.name].apis[one.v].include = false;
						}
					});
				}
			}
			service.fixList[grp].defaultIncluded = found;
		}
	}
	
	function fillServiceAccess(service, currentService) {
		service.include = true;
		service.collapse = false;
		if (service.access) {
			if (service.access === true) {
				service.accessType = 'private';
			}
			else if (service.access === false) {
				service.accessType = 'public';
			}
			else if (Array.isArray(service.access)) {
				service.accessType = 'groups';
				service.grpCodes = {};
				service.access.forEach(function (c) {
					service.grpCodes[c] = true;
				});
			}
		}
		else {
			service.accessType = 'public';
		}
		if (service.apisPermission === 'restricted') {
			service.apisRestrictPermission = true;
		}
	}
	
	function fillApiAccess(apis, forcePrivate) {
		for (var apiName in apis) {
			if (apis.hasOwnProperty(apiName)) {
				apis[apiName].include = true;
				apis[apiName].accessType = 'clear';
				if (forcePrivate === true) {
					// This variable is set to true only in the user ACL.
					apis[apiName].accessType = 'clear';
				}
				else {
					if (apis[apiName].access === true) {
						apis[apiName].accessType = 'private';
					}
					else if (apis[apiName].access === false) {
						apis[apiName].accessType = 'public';
					}
					else {
						if (Array.isArray(apis[apiName].access)) {
							apis[apiName].accessType = 'groups';
							apis[apiName].grpCodes = {};
							apis[apiName].access.forEach(function (c) {
								apis[apiName].grpCodes[c] = true;
							});
						}
					}
				}
			}
		}
	}
	
	function fillServiceApiAccess(service, currentService, forcePrivate) {
		function grpByMethod(service, fixList) {
			var byMethod = false;
			for (var grp in fixList) {
				if (fixList[grp].apisRest) {
					byMethod = true;
					for (var method in fixList[grp].apisRest) {
						if (!service[method]) {
							service[method] = {
								apis: {}
							};
						}
						fixList[grp].apisRest[method].forEach(function (api) {
							if (service.apis) {
								if (service.apis[api.v]) {
									service[method].apis[api.v] = service.apis[api.v];
								}
							}
						});
					}
				}
			}
			if (byMethod) {
				delete service.apis;
			}
		}
		
		if (!service.get && !service.post && !service.put && !service.delete) {
			grpByMethod(service, currentService.fixList);
		}
		
		if (service.get || service.post || service.put || service.delete) {
			for (var method in service) {
				if (service[method].apis) {
					fillApiAccess(service[method].apis, forcePrivate);
				}
			}
		}
		else if (service.apis) {
			fillApiAccess(service.apis, forcePrivate);
		}
	}
	
	function prepareSaveObject(aclEnvFill, aclEnvObj) {
		var code, grpCodes;
		for (var serviceName in aclEnvFill) {
			if (aclEnvFill.hasOwnProperty(serviceName)) {
				var service = angular.copy(aclEnvFill[serviceName]);
				if (service.include === true) {
					aclEnvObj[serviceName] = {};
					
					if (service.accessType === 'private') {
						aclEnvObj[serviceName].access = true;
					}
					else if (service.accessType === 'public') {
						aclEnvObj[serviceName].access = false;
					}
					else if (service.accessType === 'groups') {
						aclEnvObj[serviceName].access = [];
						grpCodes = aclEnvFill[serviceName].grpCodes;
						if (grpCodes) {
							for (code in grpCodes) {
								if (grpCodes.hasOwnProperty(code)) {
									aclEnvObj[serviceName].access.push(code);
								}
							}
						}
						if (aclEnvObj[serviceName].access.length === 0) {
							return { 'valid': false };
						}
					}
					
					if (service.apisRestrictPermission === true) {
						aclEnvObj[serviceName].apisPermission = 'restricted';
					}
					
					if (service.get || service.post || service.put || service.delete) {
						for (var method in service) {
							if (service[method].apis) {
								aclEnvObj[serviceName][method] = {
									apis: {}
								};
								
								for (var apiName in service[method].apis) {
									if (service[method].apis.hasOwnProperty(apiName)) {
										var api = service[method].apis[apiName];
										if (( service.apisRestrictPermission === true && api.include === true) || !service.apisRestrictPermission) {
											/// need to also check for the default api if restricted
											aclEnvObj[serviceName][method].apis[apiName] = {};
											if (api.accessType === 'private') {
												aclEnvObj[serviceName][method].apis[apiName].access = true;
											}
											else if (api.accessType === 'public') {
												aclEnvObj[serviceName][method].apis[apiName].access = false;
											}
											else if (api.accessType === 'groups') {
												aclEnvObj[serviceName][method].apis[apiName].access = [];
												grpCodes = aclEnvFill[serviceName][method].apis[apiName].grpCodes;
												if (grpCodes) {
													for (code in grpCodes) {
														if (grpCodes.hasOwnProperty(code)) {
															aclEnvObj[serviceName][method].apis[apiName].access.push(code);
														}
													}
												}
												if (aclEnvObj[serviceName][method].apis[apiName].access.length === 0) {
													return { 'valid': false };
												}
											}
										}
									}
								}
							}
						}
						if (service.apis) {
							delete service.apis;
						}
					}
					else if (service.apis) {
						aclEnvObj[serviceName].apis = {};
						for (apiName in service.apis) {
							if (service.apis.hasOwnProperty(apiName)) {
								var api = service.apis[apiName];
								if (( service.apisRestrictPermission === true && api.include === true) || !service.apisRestrictPermission) {
									/// need to also check for the default api if restricted
									aclEnvObj[serviceName].apis[apiName] = {};
									if (api.accessType === 'private') {
										aclEnvObj[serviceName].apis[apiName].access = true;
									}
									else if (api.accessType === 'public') {
										aclEnvObj[serviceName].apis[apiName].access = false;
									}
									else if (api.accessType === 'groups') {
										aclEnvObj[serviceName].apis[apiName].access = [];
										grpCodes = aclEnvFill[serviceName].apis[apiName].grpCodes;
										if (grpCodes) {
											for (code in grpCodes) {
												if (grpCodes.hasOwnProperty(code)) {
													aclEnvObj[serviceName].apis[apiName].access.push(code);
												}
											}
										}
										if (aclEnvObj[serviceName].apis[apiName].access.length === 0) {
											return { 'valid': false };
										}
									}
								}
							}
						}
					}
				}
			}
		}
		return { 'valid': true };
	}
	
	return {
		'fillServiceAccess': fillServiceAccess,
		'fillServiceApiAccess': fillServiceApiAccess,
		'fillApiAccess': fillApiAccess,
		'groupApisForDisplay': groupApisForDisplay,
		'checkForGroupDefault': checkForGroupDefault,
		'applyApiRestriction': applyApiRestriction,
		'prepareSaveObject': prepareSaveObject
	}
});

soajsApp.service('myAccountAccess', ['$cookies', '$localStorage', 'ngDataApi', '$timeout', function ($cookies, $localStorage, ngDataApi, $timeout) {
	
	function getUser(currentScope, username, cb) {
		if ($localStorage.soajs_user && $localStorage.soajs_user.username !== username) {
			$localStorage.soajs_user = null;
		}
		var apiParams = {
			"method": "get",
			"routeName": "/urac/account/getUser",
			"headers": {
				"key": apiConfiguration.key
			},
			"params": {
				"username": username
			}
		};
		getSendDataFromServer(currentScope, ngDataApi, apiParams, function (error, response) {
			if (error) {
				return cb(false);
			}
			if (!$localStorage.soajs_user) {
				$localStorage.soajs_user = response;
			}
			return cb(true);
		});
	}
	
	function getKeyPermissions(currentScope, cb) {
		
		$localStorage.environments = null;
		$localStorage.acl_access = null;

		getSendDataFromServer(currentScope, ngDataApi, {
			"method": "get",
			"routeName": "/key/permission/get"
		}, function (error, response) {
			if (error) {
				overlayLoading.hide();
				currentScope.displayAlert('danger', error.code, true, 'dashboard', error.message);
				return cb(false);
			}
			else {
				$cookies.put("soajs_dashboard_key", response.extKey, { 'domain': interfaceDomain });
				
				getSendDataFromServer(currentScope, ngDataApi, {
					"method": "get",
					"routeName": "/key/permission/get"
				}, function (error, response) {
					if (error) {
						overlayLoading.hide();
						currentScope.displayAlert('danger', error.code, true, 'dashboard', error.message);
						return cb(false);
					}
					if (response.locked) {
						if ($localStorage.soajs_user) {
							$localStorage.soajs_user.locked = response.locked;
						}
					}

					if (response.acl) {
						$localStorage.acl_access = response.acl;
					} else {
						console.log('Missing ACL');
					}
					if (response.environments) {
						$localStorage.environments = response.environments;
					}
					var options = {
						"method": "get",
						"routeName": "/dashboard/environment/list",
						"params": {}
					};
					getSendDataFromServer(currentScope, ngDataApi, options, function (error, envs) {
						if (error) {
							overlayLoading.hide();
							if (error.code === 600) {
								ngDataApi.logoutUser(currentScope);
								currentScope.displayAlert('danger', "Login Failed !");
								return cb(false);
							}
							else {
								console.log('Failed to get environments');
								$cookies.put("soajs_dashboard_login", true, { 'domain': interfaceDomain });
								return cb(true);
							}
						}
						else {
							$cookies.put("soajs_dashboard_login", true, { 'domain': interfaceDomain });
							$localStorage.environments = angular.copy(envs);
							$timeout(function () {
								overlayLoading.hide();
								return cb(true);
							}, 150);
						}
					});
				});
			}
		});
	}
	
	return {
		'getUser': getUser,
		'getKeyPermissions': getKeyPermissions
	}
}]);

soajsApp.service('detectBrowser', ['$window', function ($window) {
	
	return function () {
		
		var userAgent = $window.navigator.userAgent;
		
		var browsers = { chrome: /chrome/i, safari: /safari/i, firefox: /firefox/i, ie: /internet explorer/i };
		
		for (var key in browsers) {
			if (browsers[key].test(userAgent)) {
				return key;
			}
		}
		
		return 'unknown';
	}
	
}]);

soajsApp.service('swaggerClient', ["$q", "$http", "swaggerModules", "$cookies", "$location", function ($q, $http, swaggerModules, $cookies, $location) {
	
	/**
	 * format API explorer response before display
	 */
	function formatResult1(deferred, response) {
		var query = '',
			data = response.data,
			config = response.config;
		
		if (config.params) {
			var parts = [];
			for (var key in config.params) {
				parts.push(key + '=' + encodeURIComponent(config.params[key]));
			}
			if (parts.length > 0) {
				query = '?' + parts.join('&');
			}
		}
		deferred.resolve({
			url: config.url + query,
			response: {
				body: data ? (angular.isString(data) ? data : angular.toJson(data, true)) : 'no content',
				status: response.status,
				headers: angular.toJson(response.headers(), true)
			}
		});
	}
	
	/**
	 * format API explorer response before display
	 */
	function formatResult2(deferred, response) {
		var query = '',
			data = response.data,
			config = response.config;
		
		if (config.params) {
			var parts = [];
			for (var key in config.params) {
				parts.push(key + '=' + encodeURIComponent(config.params[key]));
			}
			if (parts.length > 0) {
				query = '?' + parts.join('&');
			}
		}
		deferred.resolve({
			url: config.url + query,
			response: {
				body: data ? (angular.isString(data) ? data : angular.toJson(data, true)) : 'no content',
				status: response.status,
				headers: angular.toJson(response.headers(), true)
			}
		});
	}
	
	function extractValidation(commonFields, tempInput, inputObj) {
		
		//if param is in common field ( used for objects only )
		if (tempInput.schema && tempInput.schema['$ref']) {
			inputObj.validation = getIMFVfromCommonFields(commonFields, tempInput.schema['$ref']);
		}
		//if param is a combination of array and common field
		else if (tempInput.schema && tempInput.schema.type === 'array' && tempInput.schema.items['$ref']) {
			inputObj.validation = {
				"type": "array",
				"items": getIMFVfromCommonFields(commonFields, tempInput.schema.items['$ref'])
			};
		}
		else if (tempInput.schema && tempInput.schema.properties && tempInput.schema.properties.items && tempInput.schema.properties.items.type === 'array' && tempInput.schema.properties.items.items['$ref']) {
			inputObj.validation = {
				"type": "array",
				"items": getIMFVfromCommonFields(commonFields, tempInput.schema.properties.items.items['$ref'])
			};
		}
		//if param is not a common field
		else {
			inputObj.validation = tempInput;
		}
	}
	
	function getIMFVfromCommonFields(commonFields, source) {
		var commonFieldInputName = source.toLowerCase().split("/");
		commonFieldInputName = commonFieldInputName[commonFieldInputName.length - 1];
		return commonFields[commonFieldInputName].validation;
	}
	
	function populateCommonFields(commonFields, cb) {
		//loop in all common fields
		for (var oneCommonField in commonFields) {
			recursiveMapping(commonFields[oneCommonField].validation);
		}
		return cb();
		
		//loop through one common field recursively constructing and populating all its children imfv
		function recursiveMapping(source) {
			if (source.type === 'array') {
				if (source.items['$ref'] || source.items.type === 'object') {
					source.items = mapSimpleField(source.items);
				}
				else if (source.items.type === 'object') {
					recursiveMapping(source.items);
				}
			}
			else if (source.type === 'object') {
				for (var property in source.properties) {
					if (source.properties[property]['$ref']) {
						source.properties[property] = mapSimpleField(source.properties[property]);
					}
					else if (source.properties[property].type === 'object' || source.properties[property].type === 'array') {
						recursiveMapping(source.properties[property]);
					}
				}
			}
			else {
				//map simple inputs if nay
				source = mapSimpleField(source);
			}
		}
		
		//if this input is a ref, get the ref and replace it.
		function mapSimpleField(oneField) {
			if (oneField['$ref']) {
				return getIMFVfromCommonFields(commonFields, oneField['$ref']);
			}
			else {
				return oneField;
			}
		}
	}
	
	/**
	 * override the default swagger operation
	 */
	function overrideDefaultInputs(definitions, operation, values) {
		var oldParams = angular.copy(operation.parameters);
		var oldValues = angular.copy(values);
		
		operation.parameters = [];
		
		//extract common fields
		var commonFields = {};
		if (definitions && Object.keys(definitions).length > 0) {
			for (var onecommonInput in definitions) {
				commonFields[onecommonInput.toLowerCase()] = {
					"validation": definitions[onecommonInput]
				};
			}
			populateCommonFields(commonFields, function () {
				resumeE();
			});
		}
		else {
			resumeE();
		}
		
		function resumeE() {
			//define new parameter for api
			var customBody = {
				"input": {},
				"imfv": {}
			};
			
			oldParams.forEach(function (swaggerParam) {
				var sourcePrefix = swaggerParam.in;
				if (sourcePrefix === 'path') {
					sourcePrefix = "params";
				}
				if (sourcePrefix === 'header') {
					sourcePrefix = "headers";
				}
				var inputObj = {
					"required": swaggerParam.required,
					"source": [sourcePrefix + "." + swaggerParam.name],
					"validation": {}
				};
				
				extractValidation(commonFields, swaggerParam, inputObj);
				
				customBody.imfv[swaggerParam.name] = inputObj;
				
				if (typeof(oldValues[swaggerParam.name]) === 'string' && oldValues[swaggerParam.name] !== '' && (inputObj.validation.type === 'object' || inputObj.validation.type === 'array')) {
					try {
						customBody.input[swaggerParam.name] = JSON.parse(oldValues[swaggerParam.name]);
					}
					catch (e) {
						customBody.input[swaggerParam.name] = oldValues[swaggerParam.name];
					}
				}
				else {
					customBody.input[swaggerParam.name] = oldValues[swaggerParam.name];
				}
			});
			
			operation.parameters.push(customBody);
		}
	}
	
	
	/**
	 * Send API explorer request
	 */
	this.send = function (swagger, operation, values) {
		if (['/swaggerEditor', '/endpoints'].indexOf($location.path()) !== -1) {
			var oldParams = angular.copy(operation.parameters);
			var oldValues = angular.copy(values);
			
			var deferred = $q.defer(),
				query = {},
				headers = {
					"Accept": "application/json",
					"Content-Type": "application/json"
				},
				path = '/dashboard/swagger/simulate';
			
			/**
			 * call custom method to override the defaults
			 */
			overrideDefaultInputs(swagger.definitions, operation, values);
			/**
			 * hook the headers
			 */
			if ($cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain })) {
				headers.key = $cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain }).replace(/\"/g, '');
			}
			else {
				headers.key = apiConfiguration.key;
			}
			
			// var soajsAuthCookie = $cookies.get('soajs_auth');
			// if (soajsAuthCookie && soajsAuthCookie.indexOf("Basic ") !== -1) {
			// headers.soajsauth = soajsAuthCookie.replace(/\"/g, '');
			// }
			
			var soajsAccessToken = $cookies.get('access_token', { 'domain': interfaceDomain });
			if (soajsAccessToken) {
				query.access_token = $cookies.get('access_token', { 'domain': interfaceDomain });
			}
			
			// build request
			var options = {
					method: "post",
					url: apiConfiguration.domain + path,
					headers: headers,
					data: {
						"data": operation.parameters[0]
					},
					params: query
				},
				callback = function (response) {
					// execute modules
					var response = {
						data: response.data,
						status: response.status,
						headers: response.headers,
						config: response.config
					};
					swaggerModules
						.execute(swaggerModules.AFTER_EXPLORER_LOAD, response)
						.then(function () {
							formatResult2(deferred, response);
							operation.parameters = oldParams;
							values = oldValues;
						});
				};
			
			// execute modules
			swaggerModules
				.execute(swaggerModules.BEFORE_EXPLORER_LOAD, options)
				.then(function () {
					// send request
					$http(options)
						.then(callback)
						.catch(callback);
				});
			
			return deferred.promise;
		}
		else {
			var deferred = $q.defer(),
				query = {},
				headers = {
					"Accept": "application/json",
					"Content-Type": "application/json"
				},
				path = operation.path,
				body;
			
			// build request parameters
			for (var i = 0, params = operation.parameters || [], l = params.length; i < l; i++) {
				//TODO manage 'collectionFormat' (csv etc.) !!
				var param = params[i],
					value = values[param.name];
				
				switch (param.in) {
					case 'query':
						if (!!value) {
							query[param.name] = value;
						}
						break;
					case 'path':
						path = path.replace('{' + param.name + '}', encodeURIComponent(value));
						break;
					case 'header':
						if (!!value) {
							headers[param.name] = value;
						}
						break;
					case 'formData':
						body = body || new FormData();
						if (!!value) {
							if (param.type === 'file') {
								values.contentType = undefined; // make browser defining it by himself
							}
							body.append(param.name, value);
						}
						break;
					case 'body':
						body = body || value;
						break;
				}
			}
			
			// authorization
			var authParams = operation.authParams;
			if (authParams) {
				switch (authParams.type) {
					case 'apiKey':
						switch (authParams.in) {
							case 'header':
								headers[authParams.name] = authParams.apiKey;
								break;
							case 'query':
								query[authParams.name] = authParams.apiKey;
								break;
						}
						break;
					case 'basic':
						headers.Authorization = 'Basic ' + btoa(authParams.login + ':' + authParams.password);
						break;
				}
			}
			
			/**
			 * hook the headers
			 */
			if (swagger.tenantKey) {
				headers.key = swagger.tenantKey;
			}
			else if ($cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain })) {
				headers.key = $cookies.get("soajs_dashboard_key", { 'domain': interfaceDomain }).replace(/\"/g, '');
			}
			else {
				headers.key = apiConfiguration.key;
			}
			
			var soajsAccessToken = $cookies.get('access_token', { 'domain': interfaceDomain });
			if (soajsAccessToken) {
				query.access_token = $cookies.get('access_token', { 'domain': interfaceDomain });
			}
			
			if (Object.hasOwnProperty.call(swagger, 'tenant_access_token')) {
				query.access_token = swagger.tenant_access_token;
			}
			else{
				query.access_token = '';
			}
			
			// add headers
			headers.Accept = values.responseType;
			headers['Content-Type'] = body ? values.contentType : 'text/plain';
			
			// build request
			var basePath = swagger.basePath || '',
				baseUrl = [
					swagger.schemes[0],
					'://',
					swagger.host,
					basePath.length > 0 && basePath.substring(basePath.length - 1) === '/' ? basePath.slice(0, -1) : basePath
				].join(''),
				options = {
					method: operation.httpMethod,
					url: baseUrl + path,
					headers: headers,
					data: body,
					params: query
				},
				callback = function (response) {
					// execute modules
					var response = {
						data: response.data,
						status: response.status,
						headers: response.headers,
						config: response.config
					};
					swaggerModules
						.execute(swaggerModules.AFTER_EXPLORER_LOAD, response)
						.then(function () {
							formatResult1(deferred, response);
						});
				};
			
			// execute modules
			swaggerModules
				.execute(swaggerModules.BEFORE_EXPLORER_LOAD, options)
				.then(function () {
					// send request
					$http(options)
						.then(callback)
						.catch(callback);
				});
			
			return deferred.promise;
		}
	};
}]);