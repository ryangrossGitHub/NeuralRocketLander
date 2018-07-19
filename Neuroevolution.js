const randomWeight = () => Math.random() * 2 - 1; // -1 < weight < 1 
const activation = (x) => (1 / (1 + Math.exp((-x) / 1))); //https://en.wikipedia.org/wiki/Logistic_function

var Neuroevolution = function (config) {
	var self = this; // reference to the top scope of this module

	self.config = {
		network: config.network, // Perceptron network structure
		population: config.population, // Population by generation.
		elitism: 0.2, // Best networks kepts unchanged for the next generation (rate).
		randomBehaviour: 0.1, // New random networks for the next generation (rate).
		mutationRate: 0.2, // Random mutation rate on the weights of synapses.
		mutationRange: 0.5, // Interval of random mutation changes on the synapse weight.
		convergance: 0.7
	}

	var Neuron = function () {
		this.value = 0;
		this.weights = [];

		this.populate = function (numberOfWeights) {
			for (var i = 0; i < numberOfWeights; i++) {
				this.weights.push(randomWeight());
			}
		}
	}

	var Layer = function (index) {
		this.id = index;
		this.neurons = [];

		this.populate = function (numberOfNeurons, numberOfInputs) {
			for (var i = 0; i < numberOfNeurons; i++) {
				var neuron = new Neuron();
				neuron.populate(numberOfInputs);
				this.neurons.push(neuron);
			}
		}
	}

	var Network = function (data) {
		this.layers = [];

		if(data == undefined){ 
			//First generation network, all random values
			var inputLayer = new Layer(0);
			inputLayer.populate(self.config.network[0], 0);
			this.layers.push(inputLayer);

			var previousNeurons = self.config.network[0];
			var index = 1;

			for (var i in self.config.network[1]) {
				var hiddenLayer = new Layer(index);
				hiddenLayer.populate(self.config.network[1][i], previousNeurons);
				this.layers.push(hiddenLayer);

				previousNeurons = self.config.network[1][i];
				index++;
			}

			var outputLayer = new Layer(index);
			outputLayer.populate(self.config.network[2], previousNeurons);
			this.layers.push(outputLayer);
		}else{  
			//Create from last generation network
			var previousNeurons = 0;
			var index = 0;
			var indexWeights = 0;
			for (var i in data.neurons) {
				var layer = new Layer(index);
				layer.populate(data.neurons[i], previousNeurons);
				for (var j in layer.neurons) {
					for (var k in layer.neurons[j].weights) {
						layer.neurons[j].weights[k] = data.weights[indexWeights];
						indexWeights++;
					}
				}
				previousNeurons = data.neurons[i];
				index++;
				this.layers.push(layer);
			}
		}

		this.export = function () {
			var save = {
				neurons: [], // Number of Neurons per layer.
				weights: [] // Weights of each Neuron's inputs.
			};
	
			for (var i in this.layers) {
				save.neurons.push(this.layers[i].neurons.length);
				for (var j in this.layers[i].neurons) {
					for (var k in this.layers[i].neurons[j].weights) {
						save.weights.push(this.layers[i].neurons[j].weights[k]);
					}
				}
			}
			return save;
		}

		this.compute = function (inputs) {
			// Set the value of each Neuron in the input layer.
			for (var i in inputs) {
				if (this.layers[0] && this.layers[0].neurons[i]) {
					this.layers[0].neurons[i].value = inputs[i];
				}
			}
	
			var prevLayer = this.layers[0]; // Previous layer is input layer.
			for (var i = 1; i < this.layers.length; i++) {
				for (var j in this.layers[i].neurons) {
					// For each Neuron in each layer.
					var sum = 0;
					for (var k in prevLayer.neurons) {
						// Every Neuron in the previous layer is an input to each Neuron in the next layer.
						sum += prevLayer.neurons[k].value *
							this.layers[i].neurons[j].weights[k];
					}
	
					// Compute the activation of the Neuron.
					this.layers[i].neurons[j].value = activation(sum);
				}
				prevLayer = this.layers[i];
			}
	
			// All outputs of the Network.
			var out = [];
			var lastLayer = this.layers[this.layers.length - 1];
			for (var i in lastLayer.neurons) {
				out.push(lastLayer.neurons[i].value);
			}
			return out;
		}
	}

	var Genome = function (score, network) {
		this.score = score;
		this.network = network;
	}


	var Generation = function () {
		this.genomes = [];

		this.addGenome = function (genome) {
			// Locate position to insert Genome into. Gnomes should remain sorted.
			for (var i = 0; i < this.genomes.length; i++) {
				if (genome.score > this.genomes[i].score) { //Sort desc
					break;
				}
			}
	
			// Insert genome into correct position.
			this.genomes.splice(i, 0, genome);
		},

		this.breed = function (genome1, genome2) {
			var child = [];
			
			var child = JSON.parse(JSON.stringify(genome2));
			for (var i in genome1.network.weights) {
				if (Math.random() <= 1 - self.config.convergance) {  // Genetic crossover
					child.network.weights[i] = genome1.network.weights[i];
				}
			}

			//Randomly mutate children slightly
			for (var i in child.network.weights) {
				if (Math.random() <= self.config.mutationRate) {
					child.network.weights[i] += Math.random() * self.config.mutationRange * 2 - self.config.mutationRange;
				}
			}
	
			return child;
		},

		this.getNextGeneration = function () {
			var nextGenNetworks = [];

			for (var i = 0; i < Math.round(self.config.elitism * self.config.population); i++) {
				if (nextGenNetworks.length < self.config.population) {
					nextGenNetworks.push(JSON.parse(JSON.stringify(this.genomes[i].network))); // Deep copy of its Genome's Network.
				}
			}
	
			//Randomly assign completely random weights to next generation
			for (var i = 0; i < Math.round(self.config.randomBehaviour * self.config.population); i++) {
				var network = JSON.parse(JSON.stringify(this.genomes[0].network));
				for (var w in network.weights) {
					network.weights[w] = randomWeight();
				}
				if (nextGenNetworks.length < self.config.population) {
					nextGenNetworks.push(network);
				}
			}
	
			//Breed next generation networks with best previous
			for (var i = 0; i < self.config.population-1; i++) {
				var child = this.breed(this.genomes[i], this.genomes[0]);
				nextGenNetworks.push(child.network);
			}

			return nextGenNetworks;
		}
	}

	var Generations = function () {
		this.generations = [];

		this.getfirstGeneration = function () {
			var generation = [];
			for (var i = 0; i < self.config.population; i++) {
				var network = new Network();
				generation.push(network.export());
			}
	
			this.generations.push(new Generation());
			return generation;
		},

		this.getNextGeneration = function () {
			if (this.generations.length == 0) {
				return this.getfirstGeneration();
			}
	
			var generation = this.generations[this.generations.length - 1].getNextGeneration();
			this.generations.push(new Generation());
			return generation;
		},

		this.addGenome = function (genome) {
			if (this.generations.length > 0) {
				return this.generations[this.generations.length - 1].addGenome(genome);
			}
		}
	}

	self.generations = new Generations();

	self.getNextGeneration = function () {
		var generation = self.generations.getNextGeneration();

		// Create Networks from the current Generation.
		var networks = [];
		for (var i in generation) {
			var network = new Network(generation[i]);
			networks.push(network);
		}

		// Remove old Networks.
		if (self.generations.generations.length >= 2) {
			var genomes = self.generations.generations[self.generations.generations.length - 2].genomes;
			for (var i in genomes) {
				delete genomes[i].network;
			}
		}

		// Remove older generations.
		if (self.generations.generations.length > 1) {
			self.generations.generations.splice(0, 1);
		}

		return networks;
	}

	self.setScore = function (network, score) {
		self.generations.addGenome(new Genome(score, network.export()));
	}
}
