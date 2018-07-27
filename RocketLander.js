(function() {
	var timeouts = [];
	var messageName = "zero-timeout-message";

	function setZeroTimeout(fn) {
		timeouts.push(fn);
		window.postMessage(messageName, "*");
	}

	function handleMessage(event) {
		if (event.source == window && event.data == messageName) {
			event.stopPropagation();
			if (timeouts.length > 0) {
				var fn = timeouts.shift();
				fn();
			}
		}
	}

	window.addEventListener("message", handleMessage, true);

	window.setZeroTimeout = setZeroTimeout;
})();

var AI;
var game;
var highScoreSize = 25;
var FPS = 60;
var gravity = 9.8; //Earths gravity
var crash = false;
var landing = false;
var audioEnabled = false;
var gravitationalConstant = -gravity/(1000/FPS);

var images = {};

var audio = {
	"crash": './sounds/Depth Charge Shorter-SoundBible.com-1978501900.mp3',
	"cheers": './sounds/Applause-SoundBible.com-151138312.mp3'
}

var loadImages = function(sources, callback){
	var num = 0;
	var loaded = 0;
	var imgs = {};
	for(var i in sources){
		num++;
		imgs[i] = new Image();
		imgs[i].src = sources[i];
		imgs[i].onload = function(){
			loaded++;
			if(loaded == num){
				callback(imgs);
			}
		}
	}
}

var rocketStates = {
	"flying": 0,
	"crash": 1,
	"land": 2,
	"unknown": 3
}

var Rocket = function(json){
	this.x = Math.floor(Math.random() * 400) + 50;
	this.y = 40;
	this.width = 40;
	this.height = 30;

	this.state = rocketStates.flying;
	this.explodedAnimationFrames = 0;
	this.velocity = 0;
	this.thrust = 0;
	this.thrustConstant = -0.2;
	this.landingVelocity = 5;
	this.fuel = 300;

	this.neuralNetwork;
	this.usedThrust = false;
	this.feedBackProvided = false;

	this.init(json);
}

Rocket.prototype.init = function(json){
	for(var i in json){
		this[i] = json[i];
	}
}

Rocket.prototype.burn = function(){
	this.fuel--;
	this.usedThrust = true;
	this.thrust += this.thrustConstant;
}

Rocket.prototype.update = function(height){
	this.velocity += (-gravitationalConstant + this.thrust);
	this.y += this.velocity;

	if(this.y + 2 * this.height >= height){ //Reached the ground
		if(this.velocity <= this.landingVelocity){
			this.state = rocketStates.land;
			landing = true;
		}else{
			this.state = rocketStates.crash;
			crash = true;
		}
	}else if(this.y <= 0){
		this.state = rocketStates.unknown;
	}
}

var Game = function(){
	this.rockets = [];
	this.score = 0;
	this.canvas = document.querySelector("#canvas");
	this.ctx = this.canvas.getContext("2d");
	this.width = this.canvas.width;
	this.height = this.canvas.height;
	this.spawnInterval = 90;
	this.interval = 0;
	this.flyingCount = 0;
	this.generation = 0;
	this.backgroundSpeed = 0.5;
	this.backgroundx = 0;
	this.highScores = [];
	this.surfaceHeight = 40;
}

Game.prototype.start = function(){
	this.interval = 0;
	this.rockets = [];

	var networks = AI.getNextGeneration();
	for(var i in networks){
		var rocket = new Rocket({
			"neuralNetwork": networks[i]
		});
		this.rockets.push(rocket);
	}
	this.generation++;
	this.flyingCount = this.rockets.length;
	this.landedCount = 0;

	//Don't allow high score list to grow to infinity
	if(this.highScores.length == highScoreSize){
		this.highScores = this.highScores.slice(0, highScoreSize);
	}
}

Game.prototype.updateHighScores = function(){
	var highScoresContainer = document.getElementById("scores");
	highScoresContainer.innerHTML = `
					<div style="display: flex;">
						<div style="min-width:50px">Rank</div>
						<div style="min-width:150px">Score</div>
						<div style="min-width:150px">Generation</div>
						<div style="min-width:150px">Landing Velocity</div>
						<div style="min-width:150px">Remaining Fuel</div>
					</div>
				`
	
	for(var i=0; i<highScoreSize; i++){
		if(this.highScores[i] != undefined){
			highScoresContainer.innerHTML += `
				<div style="display: flex;">
					<div style="min-width:50px">${i+1}</div>
					<div style="min-width:150px;"><b>${this.highScores[i].score}</b></div>
					<div style="min-width:150px">${this.highScores[i].generation}</div>
					<div style="min-width:150px">${this.highScores[i].velocity}</div>
					<div style="min-width:150px">${this.highScores[i].fuel}</div>
				</div>
			`;
		}
	}
}

Game.prototype.update = function(){
	for(var i in this.rockets){
		if(this.rockets[i].state == rocketStates.flying){
			var inputs = [this.rockets[i].y / this.height, this.rockets[i].velocity, this.rockets[i].fuel];

			var res = this.rockets[i].neuralNetwork.compute(inputs);
			if(res > 0.5 && this.rockets[i].fuel > 0){
				this.rockets[i].burn();
			}else{
				this.rockets[i].thrust = 0;
			}

			this.rockets[i].update(this.height);
		}else if(!this.rockets[i].feedBackProvided){
			this.rockets[i].feedBackProvided = true;
			this.flyingCount--;

			var score = 0;

			//Landing reward
			if(this.rockets[i].state == rocketStates.land){
				this.landedCount++;
				score += 500;
			}

			//Using thrust award
			if(this.rockets[i].usedThrust){
				score += 5;
			}
			
			//Low velocity award
			var velocity = Math.round(this.rockets[i].velocity * 100) / 100;
			if(velocity > 0){ //Don't reward flying into the sun (negative values)
				score += Math.pow(25 - velocity, 2);

				//Conserving fuel award (divided by 5 because this is less important than landing)
				// score += this.rockets[i].fuel/50;
			}

			score = Math.round(score * 100) / 100;

			//AI Feedback loop
			AI.setScore(this.rockets[i].neuralNetwork, score);

			//High Scores
			this.highScores.push({
				"score": score,
				"generation" : this.generation,
				"velocity" : velocity,
				"fuel" : this.rockets[i].fuel
			});

			this.highScores.sort((a, b) => {
				if (a.score > b.score) return -1;
				if (a.score < b.score) return 1;
				return 0;
			});

			//Start next gen
			if(this.flyingCount == 0){
				setTimeout(function(game){
					game.start();
				}, 100, this)
			}
		}

	}

	setTimeout(function(game){
		game.update();
	}, 1000/FPS, this);

	setTimeout(function(game){
		game.updateHighScores();
	}, 1000, this);

	setTimeout(function(){
		if(audioEnabled && crash){
			crash = false;
			new Audio(audio.crash).play();
		}
	}, 2000);

	setTimeout(function(){
		if(audioEnabled && landing){
			landing = false;
			new Audio(audio.cheers).play();
		}
	}, 5000);
}

Game.prototype.display = function(){
	//Background
	this.ctx.clearRect(0, 0, this.width, this.height);
	for(var i = 0; i < Math.ceil(this.width / images.background.width) + 1; i++){
		this.ctx.drawImage(images.background, i * images.background.width - Math.floor(this.backgroundx%images.background.width), 0)
	}

	//Moon
	this.ctx.drawImage(images.moon, 0, this.canvas.height - this.surfaceHeight - 7, this.canvas.width, this.surfaceHeight + 7);

	//Rockets
	for(var i in this.rockets){
		if(this.rockets[i].state == rocketStates.flying){
			this.ctx.save();

			if(this.rockets[i].thrust < 0){
				this.ctx.translate(this.rockets[i].x + this.rockets[i].width/2, this.rockets[i].y + this.rockets[i].height/2);
				this.ctx.drawImage(images.rocket, -this.rockets[i].width/2, -this.rockets[i].height/2, this.rockets[i].width, this.rockets[i].height);
			}else{
				this.ctx.translate(this.rockets[i].x + this.rockets[i].width/2, this.rockets[i].y + this.rockets[i].height/2);
				this.ctx.drawImage(images.rocket_no_thrust, -this.rockets[i].width/2, -this.rockets[i].height/2, this.rockets[i].width, this.rockets[i].height);
			}

			this.ctx.restore();
		}else if(this.rockets[i].state == rocketStates.land){
			this.ctx.save();
			this.ctx.translate(this.rockets[i].x + this.rockets[i].width/2, this.rockets[i].y + this.rockets[i].height/2);
			this.ctx.drawImage(images.rocket_landed, -this.rockets[i].width/2, -this.rockets[i].height*1.5, this.rockets[i].width*2.5, this.rockets[i].height*2.5);
			this.ctx.restore();
		}else if(this.rockets[i].state == rocketStates.crash && this.rockets[i].explodedAnimationFrames < 20){
			this.ctx.save(); 
			this.ctx.translate(this.rockets[i].x + this.rockets[i].width/2, this.rockets[i].y + this.rockets[i].height/2);
			this.ctx.drawImage(images.rocket_crash, -this.rockets[i].width, -this.rockets[i].height*1.8, this.rockets[i].width*2, this.rockets[i].height*2);
			this.ctx.restore();

			this.rockets[i].explodedAnimationFrames++;
		}
	}

	this.ctx.fillStyle = "white";
	this.ctx.font="20px Oswald, sans-serif";
	this.ctx.fillText("Generation : "+this.generation, 10, 25);
	this.ctx.fillText("Landed : "+this.landedCount+" / "+AI.config.population, 10, 50);

	var self = this;
	requestAnimationFrame(function(){
		self.display();
	});
}

window.onload = function(){
	var sprites = {
		rocket:"./img/rocket.png",
		rocket_no_thrust: "./img/rocket_no_thrust.png",
		rocket_landed: "./img/rocket_landed.png",
		rocket_crash: "./img/rocket_crash.png",
		background:"./img/space.png",
		moon: "./img/moon.png"
	}

	var start = function(population){
		AI = new Neuroevolution({
			network: [3, [15], 1], 
			population: population, 
		});
		game = new Game();
		game.start();
		game.update();
		game.display();
	}


	loadImages(sprites, function(imgs){
		images = imgs;
		start(10);
	});
}

function toggleSound(){
	audioEnabled = audioEnabled ? false : true;
}
