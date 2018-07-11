"use strict";
var infraFirewallApp = soajsApp.components;
infraFirewallApp.controller('infraFirewallCtrl', ['$scope', '$localStorage', '$window', '$modal', '$timeout', '$cookies', 'injectFiles', 'ngDataApi', 'infraCommonSrv', 'infraFirewallSrv', function ($scope, $localStorage, $window, $modal, $timeout, $cookies, injectFiles, ngDataApi, infraCommonSrv, infraFirewallSrv) {
	$scope.$parent.isUserNameLoggedIn();
	$scope.showTemplateForm = false;
	
	$scope.access = {};
	constructModulePermissions($scope, $scope.access, infraFirewallConfig.permissions);
	
	infraCommonSrv.getInfraFromCookie($scope);
	
	$scope.$parent.$parent.switchInfra = function (oneInfra) {
		infraCommonSrv.switchInfra($scope, oneInfra, ["groups", "regions", "templates"], () => {
			// infraIACSrv.rerenderTemplates($scope);
		});
	};
	
	$scope.$parent.$parent.activateProvider = function () {
		infraCommonSrv.activateProvider($scope);
	};
	
	$scope.getProviders = function () {
		if($localStorage.infraProviders){
			$scope.$parent.$parent.infraProviders = angular.copy($localStorage.infraProviders);
			if(!$scope.$parent.$parent.currentSelectedInfra){
				$scope.go("/infra");
			}
			else{
				delete $scope.$parent.$parent.currentSelectedInfra.templates;
				$scope.$parent.$parent.switchInfra($scope.$parent.$parent.currentSelectedInfra);
			}
		}
		else{
			//list infras to build sidebar
			infraCommonSrv.getInfra($scope, {
				id: null,
				exclude: ["groups", "regions", "templates"]
			}, (error, infras) => {
				if (error) {
					$scope.displayAlert("danger", error);
				}
				else {
					$scope.infraProviders = infras;
					$localStorage.infraProviders = angular.copy($scope.infraProviders);
					$scope.$parent.$parent.infraProviders = angular.copy($scope.infraProviders);
					if(!$scope.$parent.$parent.currentSelectedInfra){
						$scope.go("/infra");
					}
					else{
						delete $scope.$parent.$parent.currentSelectedInfra.templates;
						$scope.$parent.$parent.switchInfra($scope.$parent.$parent.currentSelectedInfra);
					}
				}
			});
		}
	};
	
	$scope.deleteFirewall = function (oneFirewall, oneInfra) {
		// let options = {
		// 	"method": "delete",
		// 	"routeName": "/dashboard/infra/template",
		// 	"params": {
		// 		"id": oneInfra._id,
		// 		"templateId": oneTemplate._id,
		// 		"templateName": oneTemplate.name
		// 	}
		// };
		// overlayLoading.show();
		// getSendDataFromServer($scope, ngDataApi, options, function (error) {
		// 	overlayLoading.hide();
		// 	if (error) {
		// 		$scope.displayAlert("danger", error);
		// 	}
		// 	else {
		// 		$scope.displayAlert("success", "Template deleted successfully.");
		// 		$scope.getProviders();
		// 	}
		// });
	};
	
	$scope.addFirewall = function (oneInfra) {
		infraFirewallSrv.addFirewall($scope, oneInfra);
	};
	
	$scope.editFirewall = function (oneFirewall, oneInfra) {
		infraFirewallSrv.editFirewall($scope, oneInfra, oneFirewall);
	};
	
	if ($scope.access.list) {
		$scope.getProviders();
	}
	injectFiles.injectCss("modules/dashboard/infra/infra.css");
}]);