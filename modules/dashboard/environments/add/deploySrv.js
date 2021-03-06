"use strict";
var deployServices = soajsApp.components;
deployServices.service('deploymentSrv', ['ngDataApi', '$timeout', '$modal', '$localStorage', '$window', function (ngDataApi, $timeout, $modal, $localStorage, $window) {
	
	let mainScope; // set on go
	
	function calculateRestrictions(currentScope) {
		let restrictions = currentScope.wizard.template.restriction;
		let showManualDeploy = true; // show manual iff none of the stages is repos/resources/secrets deployment // stronger then restrictions
		let showonDemand = false; // only in case of a blank env, manual
		let manual = true;
		
		currentScope.restrictions = {
			docker: false,
			kubernetes: false,
			vm: false,
			previousEnv: false,
			onDemand: showonDemand,
			showManual: showManualDeploy
		};
		
		if (currentScope.envType && currentScope.envType === 'manual') {
			if (!currentScope.wizard.template.content || Object.keys(currentScope.wizard.template.content).length === 0) {
				showonDemand = true;
			}
			currentScope.restrictions.onDemand = showonDemand;
			if(switchDriver){
				switchDriver('manual');
			}
		} else {
			showManualDeploy = false;
			manual = false;
		}
		
		let docker = false, vm = false, kubernetes = false;
		currentScope.infraProviders.forEach((oneInfra) => {
			if(!showonDemand){
				if (oneInfra.technologies.indexOf('kubernetes') !== -1) {
					kubernetes = true;
				}
				
				if (oneInfra.technologies.indexOf('docker') !== -1) {
					docker = true;
				}
				
				if (oneInfra.technologies.indexOf('vm') !== -1) {
					vm = true;
				}
			}
		});
		
		// no restrictions obj
		if (!restrictions || Object.keys(restrictions).length === 0) {
			let myPrevious = (currentScope.envType !== 'manual');
			currentScope.restrictions = {
				vm: vm,
				docker: docker,
				kubernetes: kubernetes,
				previousEnv: myPrevious,
				onDemand: showonDemand,
				showManual: showManualDeploy
			};
			return;
		}
		
		if (restrictions && restrictions.deployment) {
			vm = false;
			docker = false;
			kubernetes = false;
			
			if(!showonDemand) {
				if (restrictions.deployment.indexOf('container') !== -1) {
					showonDemand = false; // todo
					if (restrictions.driver) {
						if (restrictions.driver.indexOf('container.docker') !== -1) {
							docker = true;
						}
						if (restrictions.driver.indexOf('container.kubernetes') !== -1) {
							kubernetes = true;
						}
					}
					else {
						docker = true;
						kubernetes = true;
					}
				}
				
				if(restrictions.deployment.indexOf('vm') !== -1){
					vm = true;
				}
			}
		}
		
		if (showManualDeploy && restrictions && restrictions.deployment && restrictions.deployment.indexOf('manual') !== -1) {
			manual = true;
		}
		
		currentScope.restrictions = {
			vm: vm,
			docker: docker,
			kubernetes: kubernetes,
			previousEnv: (docker || kubernetes),
			onDemand: showonDemand,
			showManual: manual
		};
		if (restrictions && Object.hasOwnProperty.call(restrictions, 'allowInfraReuse')) {
			if (restrictions.allowInfraReuse === false) {
				currentScope.restrictions.previousEnv = false;
			}
		}
	}
	
	function switchDriver(driver) {
		if (!mainScope.platforms) {
			mainScope.platforms = {
				manual: true,
				docker: false,
				kubernetes: false,
				previous: false,
				ondemand: false
			};
		}
		
		switch (driver) {
			case 'previous':
				if (mainScope.form && mainScope.form.formData && mainScope.form.formData.deployment && mainScope.form.formData.deployment.previousEnvironment) {
					mainScope.changeLikeEnv();
				}
				mainScope.platforms.previous = true;
				mainScope.platforms.docker = false;
				mainScope.platforms.kubernetes = false;
				mainScope.platforms.manual = false;
				mainScope.platforms.ondemand = false;
				mainScope.allowLocalContainerDeployment = getDashboardDeploymentStyle();
				break;
			case 'docker':
				delete mainScope.previousEnvironment;
				mainScope.platforms.previous = false;
				mainScope.platforms.docker = true;
				mainScope.platforms.kubernetes = false;
				mainScope.platforms.manual = false;
				mainScope.platforms.ondemand = false;
				mainScope.allowLocalContainerDeployment = getDashboardDeploymentStyle();
				break;
			case 'kubernetes':
				delete mainScope.previousEnvironment;
				mainScope.platforms.previous = false;
				mainScope.platforms.kubernetes = true;
				mainScope.platforms.docker = false;
				mainScope.platforms.manual = false;
				mainScope.platforms.ondemand = false;
				mainScope.allowLocalContainerDeployment = getDashboardDeploymentStyle();
				break;
			case 'ondemand':
				delete mainScope.previousEnvironment;
				mainScope.platforms.previous = false;
				mainScope.platforms.docker = false;
				mainScope.platforms.kubernetes = false;
				mainScope.platforms.manual = false;
				mainScope.platforms.ondemand = true;
				break;
			case 'manual':
			default:
				delete mainScope.previousEnvironment;
				mainScope.platforms.previous = false;
				mainScope.platforms.docker = false;
				mainScope.platforms.kubernetes = false;
				mainScope.platforms.manual = true;
				break;
		}
	}
	
	function renderPreviousDeployInfo(currentScope) {
		for (let i = currentScope.availableEnvironments.length - 1; i >= 0; i--) {
			if (currentScope.availableEnvironments[i].code === currentScope.previousEnvironment) {
				currentScope.platform = currentScope.availableEnvironments[i].deployer.selected.split(".")[1];
				currentScope.driver = currentScope.availableEnvironments[i].deployer.selected.split(".")[2];
				currentScope.config = currentScope.availableEnvironments[i].deployer.container[currentScope.platform][currentScope.driver];
				//link the infra that was used for this environment
				currentScope.infraProviders.forEach((oneProvider) => {
					oneProvider.deployments.forEach((oneDeployment) => {
						if(oneDeployment.environments.indexOf(currentScope.previousEnvironment) !== -1){
							mainScope.wizard.selectedInfraProvider = oneProvider;
						}
					});
				});
			}
		}
	}
	
	function getDashboardDeploymentStyle() {
		let status = false;
		$localStorage.environments.forEach((oneEnv) => {
			if (oneEnv.code === 'DASHBOARD' && oneEnv.deployer.type !== 'manual') {
				status = true
			}
		});
		
		return status;
	}
	
	function handleFormData(currentScope, formData) {
		if (currentScope.platforms.ondemand) {
			delete formData.kubernetes;
			delete formData.docker;
			delete formData.previousEnvironment;
			formData.selectedDriver = 'ondemand';
		}
		else if (currentScope.platforms.manual) {
			formData.selectedDriver = 'manual';
			delete formData.kubernetes;
			delete formData.docker;
			delete formData.previousEnvironment;
		}
		else if (currentScope.platforms.previous) {
			if (currentScope.previousEnvironment === '') {
				$window.alert("Select the environment your want to clone its deployment settings to proceed!");
				return false;
			}
			
			//on first run, formData.selectedDriver is not being set
			//on refresh it works
			formData.selectedDriver = currentScope.platform;
			formData.previousEnvironment = currentScope.previousEnvironment;
		}
		else {
			delete formData.previousEnvironment;
			
			//check and switch on demand if template requires not deployment for containers
			if(!currentScope.wizard.template.content || Object.keys(currentScope.wizard.template.content).length === 0){
				
				if(currentScope.wizard.selectedInfraProvider){
					formData = angular.copy(currentScope.wizard.selectedInfraProvider.deploy);
					delete formData.grid;
					formData.selectedDriver = formData.technology;
				}
				else{
					delete formData.kubernetes;
					delete formData.docker;
					delete formData.previousEnvironment;
					formData.selectedDriver = 'ondemand';
				}
			}
			else{
				if(!currentScope.wizard.selectedInfraProvider){
					$window.alert("Please select a cloud provider to proceed.");
					return false;
				}
				formData = angular.copy(currentScope.wizard.selectedInfraProvider.deploy);
				delete formData.grid;
				formData.selectedDriver = formData.technology;
			}
		}
		
		currentScope.wizard.deployment = angular.copy(formData);
		if(!currentScope.containerWizard){
			$localStorage.addEnv = angular.copy(currentScope.wizard);
			delete $localStorage.addEnv.template.content;
			currentScope.nextStep();
		}
	}
	
	function go(currentScope, cb) {
		if (!currentScope.envType) {
			if ($localStorage.envType) {
				currentScope.envType = $localStorage.envType;
			}
		}
		
		mainScope = currentScope;
		currentScope.switchDriver = switchDriver;
		currentScope.selectProvider = selectProvider;
		
		currentScope.dockerImagePath = "./themes/" + themeToUse + "/img/docker_logo.png";
		currentScope.kubernetesImagePath = "./themes/" + themeToUse + "/img/kubernetes_logo.png";
		
		currentScope.availableEnvironments = angular.copy($localStorage.environments);
		if (currentScope.availableEnvironments.length > 0) {
			for (let i = currentScope.availableEnvironments.length - 1; i >= 0; i--) {
				if (currentScope.availableEnvironments[i].deployer.type === 'manual') {
					currentScope.availableEnvironments.splice(i, 1);
				}
				else if (currentScope.availableEnvironments[i].code === currentScope.wizard.gi.code) {
					currentScope.availableEnvironments.splice(i, 1);
				}
			}
		}
		
		currentScope.changeLikeEnv = function () {
			currentScope.previousPlatformDeployment = true;
			currentScope.previousEnvironment = currentScope.form.formData.deployment.previousEnvironment;
			renderPreviousDeployInfo(currentScope);
		};
		
		overlayLoading.show();
		currentScope.previousPlatformDeployment = false;
		let configuration = angular.copy(environmentsConfig.form.add.deploy.entries);
		
		let options = {
			timeout: $timeout,
			entries: configuration,
			name: 'addEnvironment',
			label: translation.addNewEnvironment[LANG],
			actions: [
				{
					'type': 'button',
					'label': "Back",
					'btn': 'success',
					'action': function () {
						if (currentScope.form && currentScope.form.formData) {
							currentScope.form.formData = {};
						}
						currentScope.previousStep();
					}
				}
			]
		};
		
		listInfraProviders(currentScope, () => {
			buildForm(currentScope, $modal, options, function () {
				
				currentScope.mapStorageToWizard($localStorage.addEnv);
				
				if (currentScope.wizard.deployment) {
					currentScope.form.formData = angular.copy(currentScope.wizard.deployment);
				}
				
				if (!currentScope.form.formData) {
					currentScope.form.formData = {};
				}
				
				if (currentScope.form.formData.previousEnvironment) {
					currentScope.previousEnvironment = currentScope.form.formData.previousEnvironment;
				}
				
				if(currentScope.wizard.selectedInfraProvider){
					currentScope.form.formData.selectedDriver = currentScope.wizard.selectedInfraProvider.technologies[0];
					
					currentScope.infraProviders.forEach((oneProvider) => {
						if(oneProvider.name === currentScope.wizard.selectedInfraProvider.name){
							oneProvider.deploy = currentScope.wizard.selectedInfraProvider.deploy;
						}
					});
				}
				
				currentScope.platforms = {
					docker: currentScope.form.formData.selectedDriver === 'docker' || false,
					kubernetes: currentScope.form.formData.selectedDriver === 'kubernetes' || false,
					manual: currentScope.form.formData.selectedDriver === 'manual' || false,
					previous: currentScope.previousEnvironment,
					ondemand: currentScope.form.formData.selectedDriver === 'ondemand' || false
				};
				
				if (currentScope.previousEnvironment && currentScope.previousEnvironment !== '') {
					currentScope.previousPlatformDeployment = true;
					currentScope.platforms = {
						docker: false,
						kubernetes: false,
						manual: false,
						previous: currentScope.previousEnvironment
					};
					renderPreviousDeployInfo(currentScope);
				}
				
				calculateRestrictions(currentScope);
				
				if(currentScope.envType === 'manual' || (currentScope.envType !== 'manual' && currentScope.infraProviders && currentScope.infraProviders.length > 0)){
					
					if (!currentScope.wizard.template.content || Object.keys(currentScope.wizard.template.content).length === 0) {
						options.actions.push({
							'type': 'submit',
							'label': (currentScope.restrictions.vm) ? 'Next' : 'OverView & Finalize',
							'btn': 'primary',
							'action': function (formData) {
								currentScope.referringStep = 'deploy';
								handleFormData(currentScope, formData);
							}
						});
					}
					else {
						//if no provider showin and vm is used, trigger next automatically
						if(currentScope.restrictions.vm && !currentScope.restrictions.docker && !currentScope.restrictions.docker){
							
							if(currentScope.restrictions.showManual){
								options.actions.push({
									'type': 'submit',
									'label': "Next",
									'btn': 'primary',
									'action': function (formData) {
										currentScope.referringStep = 'deploy';
										handleFormData(currentScope, formData);
									}
								});
							}
							else{
								if(currentScope.referringStep === 'vm'){
									currentScope.referringStep = 'deploy';
									currentScope.previousStep();
								}
								else {
									currentScope.platforms.ondemand = true;
									currentScope.referringStep = 'deploy';
									handleFormData(currentScope, {
										deployment :{
											manual :{
												nodes: "127.0.0.1"
											}
										}
									});
								}
							}
						}
						else{
							options.actions.push({
								'type': 'submit',
								'label': "Next",
								'btn': 'primary',
								'action': function (formData) {
									currentScope.referringStep = 'deploy';
									handleFormData(currentScope, formData);
								}
							});
						}
					}
				}
				
				options.actions.push({
					'type': 'reset',
					'label': translation.cancel[LANG],
					'btn': 'danger',
					'action': function () {
						delete $localStorage.addEnv;
						delete currentScope.wizard;
						delete currentScope.reusableData;
						currentScope.form.formData = {};
						currentScope.$parent.go("/environments")
					}
				});
				
				currentScope.allowLocalContainerDeployment = getDashboardDeploymentStyle();
				overlayLoading.hide();
				
				if(cb && typeof cb === 'function'){
					return cb();
				}
			});
		});
	}
	
	function selectProvider(oneProvider, technology) {
		let selectedInfraProvider = angular.copy(oneProvider);
		mainScope.infraProviders.forEach((oneProvider) => {
			delete oneProvider.deploy;
		});
		
		let formEntries = angular.copy(environmentsConfig.providers[oneProvider.name][technology].ui.form.deploy.entries);
		if(formEntries && formEntries.length > 0){
			formEntries.forEach((oneEntry) => {
				if (oneEntry.name === 'region') {
					oneEntry.value = oneProvider.regions;
					oneEntry.value[0].selected = true;
				}
			});
			
			let infraTemplates =[];
			oneProvider.templates.forEach((oneTmpl) => {
				let label = oneTmpl.name;
				if(oneTmpl.description && oneTmpl.description !== ''){
					label += " | " + oneTmpl.description;
				}
				infraTemplates.push({'v': oneTmpl.name, 'l': label});
			});
			
			formEntries.unshift({
				type: 'select',
				name: 'infraCodeTemplate',
				label: "Infra Code Template",
				value: infraTemplates,
				required: true,
				fieldMsg: "Pick which Infra Code template to use for the deployment of your cluster.",
				onAction: function(id, value, form){
					oneProvider.templates.forEach((oneTmpl) => {
						if(oneTmpl.name === value && oneTmpl.inputs && Array.isArray(oneTmpl.inputs)){
							form.entries = form.entries.concat(oneTmpl.inputs);
						}
					});
				}
			});
			
			$modal.open({
				templateUrl: "infraProvider.tmpl",
				size: 'lg',
				backdrop: true,
				keyboard: true,
				controller: function ($scope, $modalInstance) {
					fixBackDrop();
					$scope.title = 'Configuring Deployment on ' + selectedInfraProvider.label;
					let formConfig = {
						timeout: $timeout,
						data: (mainScope.wizard.selectedInfraProvider) ? mainScope.wizard.selectedInfraProvider.deploy : {},
						"entries": formEntries,
						name: 'deployon' + selectedInfraProvider.name,
						"actions": [
							{
								'type': 'submit',
								'label': "Save & Continue",
								'btn': 'primary',
								'action': function (formData) {
									selectedInfraProvider.deploy = formData;
									selectedInfraProvider.deploy.grid = environmentsConfig.providers[oneProvider.name][technology].ui.form.deploy.grid;
									//fill the columns
									oneProvider.templates.forEach((oneTmpl) => {
										if(oneTmpl.name === formData['infraCodeTemplate'] && oneTmpl.display){
											selectedInfraProvider.deploy.grid.columns = oneTmpl.display;
										}
									});
									
									selectedInfraProvider.deploy.technology = technology;
									mainScope.wizard.selectedInfraProvider = selectedInfraProvider;
									oneProvider.deploy = selectedInfraProvider.deploy;
									$modalInstance.close();
								}
							},
							{
								'type': 'reset',
								'label': translation.cancel[LANG],
								'btn': 'danger',
								'action': function () {
									if(mainScope.wizard.selectedInfraProvider){
										oneProvider.deploy = mainScope.wizard.selectedInfraProvider.deploy;
									}
									$modalInstance.dismiss('cancel');
								}
							}
						]
					};
					
					buildForm($scope, null, formConfig, function () {
						if(mainScope.wizard.selectedInfraProvider && mainScope.wizard.selectedInfraProvider.deploy){
							let chosenTemplate = mainScope.wizard.selectedInfraProvider.deploy['infraCodeTemplate'];
							oneProvider.templates.forEach((oneTmpl) => {
								if(oneTmpl.name === chosenTemplate && oneTmpl.inputs && Array.isArray(oneTmpl.inputs)){
									$scope.form.entries = $scope.form.entries.concat(oneTmpl.inputs);
								}
							});
							$scope.form.formData = mainScope.wizard.selectedInfraProvider.deploy;
						}
					});
				}
			});
		}
		else{
			selectedInfraProvider.deploy = {};
			selectedInfraProvider.deploy.technology = technology;
			oneProvider.deploy = selectedInfraProvider.deploy;
			mainScope.wizard.selectedInfraProvider = selectedInfraProvider;
		}
	}
	
	function listInfraProviders(currentScope, cb) {
		currentScope.showDockerAccordion = false;
		currentScope.showKubeAccordion = false;
		
		//get the available providers
		getSendDataFromServer(currentScope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/infra",
			"params":{
				"exclude": [ "groups", "extra" ]
			}
		}, function (error, providers) {
			if (error) {
				overlayLoading.hide();
				currentScope.displayAlert('danger', error.message);
			}
			else {
				currentScope.infraProviders = angular.copy(providers);
				delete currentScope.infraProviders.soajsauth;
				currentScope.infraProviders.forEach((oneProvider) => {
					if(oneProvider.technologies.indexOf('docker') !== -1){
						currentScope.showDockerAccordion = true;
					}
					if(oneProvider.technologies.indexOf('kubernetes') !== -1){
						currentScope.showKubeAccordion = true;
					}
					
					if (oneProvider.name === 'local') {
						let technolog = oneProvider.technologies[0];
						oneProvider.image = "themes/" + themeToUse + "/img/" + technolog + "_logo.png";
					}
					else {
						oneProvider.image = "modules/dashboard/environments/images/" + oneProvider.name + ".png";
					}
				});
				return cb();
			}
		});
	}
	
	return {
		"go": go,
		"handleFormData": handleFormData
	}
}]);