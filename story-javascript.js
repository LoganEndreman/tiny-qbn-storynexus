/*
TinyQBN: quality-based narratives in Twine 2 & Sugarcube.

Copyright 2019 Joshua I. Grams <josh@qualdan.com>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

State.initPRNG()

var QBN = {}
window.QBN = QBN

var getVar = State.getVar || Wikifier.getValue
var setVar = State.setVar || Wikifier.setValue

// Construct initial deck from `card` and `sticky-card` passages.
function resetDeck() {
	var deck = {}
	var cardTags = ['card', 'sticky-card']
	for(var i=0; i<cardTags.length; ++i) {
		var sel = 'tw-passagedata[tags~=' + cardTags[i] + ']'
		var c = document.querySelectorAll(sel)
		for(var j=0; j<c.length; ++j) {
			var title = c[j].getAttribute('name')
			deck[title] = i
		}
	}
	setVar('$QBN_deck', deck)
}
resetDeck()

// Remove single-use cards when visited.
$(document).on(':passagestart', function(evt) {
	var title = evt.passage.title
	var deck = getVar('$QBN_deck')
	if(deck[title] === 0) delete deck[title]
})

// Choose `count` random values from `array`.
function choose(array, count) {
	// Can't choose more values than the array has.
	count = Math.min(count, array.length)
	// If choosing more than half the array, *exclude* random values.
	var n = Math.min(count, array.length - count)
	var include = (n == count)
	// Choose `n` random indices.
	var selected = [], indices = {}, chosen = 0
	while(chosen < n) {
		var i = Math.floor(State.random() * array.length)
		// Don't choose the same one twice.
		if(indices[i] === undefined) {
			if(include) selected.push(array[i])
			indices[i] = true
			++chosen
		}
	}
	// If excluding values, we build the output afterwards.
	if(!include) {
		for(i=0; i<array.length; ++i) {
			if(indices[i] !== true) selected.push(array[i])
		}
	}
	return selected
}

QBN.passages = function(extraVars, n) {
	if(n == null && typeof extraVars === 'number') {
		n = extraVars; extraVars = {}
	} else if(extraVars == null) extraVars = {}
	var passages = Story.lookupWith(function(p) {
		return QBN.passageMatches(p, extraVars)
	})
	if(n) passages = choose(passages, n)
	for(var i=0; i<passages.length; ++i) passages[i] = passages[i].title
	return passages
}

var operators = {
	eq: function(a, b) { return a == b },
	ne: function(a, b) { return a != b },
	lt: function(a, b) { return a < b },
	gt: function(a, b) { return a > b },
	le: function(a, b) { return a <= b },
	ge: function(a, b) { return a >= b },
}

QBN.functions = [
	{
		match: /^not-(.+)/,
		action: function(m, extraVars) {
			return !QBN.has(m[1], extraVars)
		}
	},
	{
		match: /^random-([0-9]+)/,
		action: function(m, extraVars) {
			return State.random() < m[1] / 100
		}
	},
	{
		match: /^(.*)-(eq|ne|lt|gt|le|ge)-(.*)/,
		action: function(m, extraVars) {
			var actual = QBN.value(m[1], extraVars)
			var op = operators[m[2]]
			var expected = m[3]
			if(typeof actual === 'number') {
				expected = expected.replace('_', '.')
			}
			return op(actual, expected)
		}
	}
]

QBN.range = function(name, ranges) {
	if(typeof name !== 'string') {
		var msg = "QBN.range: name must be a string"
		msg += " (got " + (typeof name) + ")."
		throw new Error(msg)
	}
	if(!/^[$_][_a-zA-Z][_a-zA-Z0-9]*$/.test(name)) {
		var msg = "QBN.range: invalid name " + JSON.stringify(name) + "."
		throw new Error(msg)
	}
	var value = getVar(name)
	if(typeof value === 'undefined') {
		var msg = "QBN.range: no such variable " + JSON.stringify(name) + "."
		throw new Error(msg)
	}
	var n = ranges.length
	if(typeof n !== 'number' || n < 2) {
		var msg = "QBN.range: invalid range spec:"
		msg += " must have at least two values"
		msg += " (got " + JSON.stringify(n) + ")."
		throw new Error(msg)
	}
	var range, lower, prev
	for(var i=0; i<ranges.length; ++i) {
		var r = ranges[i]
		if(typeof r === 'string' && typeof prev === 'string') {
			var msg = "QBN.range: invalid range spec " + JSON.stringify(ranges)
			msg += ": may not have two consecutive strings."
			throw new Error(msg)
		}
		prev = r
		if(typeof r === 'string') range = r;
		else if(typeof r === 'number') {
			if(typeof lower !== "undefined" && r <= lower) {
				var msg = "QBN.range: invalid range spec " + JSON.stringify(ranges)
				msg += ": numbers must be strictly increasing."
				throw new Error(msg)
			}
			if(value < r) { if(range) break; else return }
			lower = r
			range = undefined
		} else {
			var msg = "QBN.range: invalid range spec " + JSON.stringify(ranges)
			msg += ": may only contain strings and numbers."
			throw new Error(msg)
		}
	}
	setVar('_' + range + '_' + name.substring(1), true)
}

QBN.value = function(name, extraVars) {
	var v = State.variables, t = State.temporary
	var value = extraVars[name]
	if(value == null) value = t[name]
	if(value == null) value = v[name]
	return value
}

QBN.has = function(tag, extraVars) {
	var v = State.variables, t = State.temporary
	var yes = null
	for(var j=0; j<QBN.functions.length; ++j) {
		var  fn= QBN.functions[j]
		var m = fn.match.exec(tag)
		if(m) { yes = fn.action(m, extraVars); break }
	}
	if(yes === null) {
		if(extraVars[tag] != null) yes = extraVars[tag]
		else if(t[tag] != null) yes = t[tag]
		else yes = v[tag]
	}
	return !!yes
}

QBN.passageMatches = function(p, extraVars) {
	var deck = getVar('$QBN_deck')
	if(deck[p.title] == null) return false
	for(var i=0; i<p.tags.length; ++i) {
		var tag = p.tags[i]
		var prefix = /^req-/.exec(tag)
		if(prefix) tag = tag.substring(prefix[0].length)
		else continue
		if(!QBN.has(tag, extraVars)) return false
	}
	return true
}

Macro.add('addcard', {
	handler: function() {
		var title = this.args[0], sticky = this.args[1]
		if(!Story.has(title)) {
			return this.error('No such passage "' + title + '".')
		}
		var deck = getVar('$QBN_deck')
		deck[title] = (sticky ? 1 : 0)
	}
})

Macro.add('removecard', {
	handler: function() {
		var title = this.args[0]
		var always = this.args[1] !== false
		if(!Story.has(title)) {
			return this.error('No such passage "' + title + '".')
		}
		var deck = getVar('$QBN_deck')
		if(deck[title] === 0 || (always && deck[title] === 1)) {
			delete deck[title]
		}
	}
})

function list(l) {
	return (typeof l !== 'object' || l.length == null) ? [l] : l
}

Macro.add('includeall', {
	handler: function() {
		var passages = list(this.args[0])
		var wrap = this.args[1]
		if(wrap && !Macro.has(wrap)) {
			return this.error("No such widget " + JSON.stringify(this.args[1]) + ".")
		}
		var separate = this.args[2]
		var $output = $(this.output)
		var deck = getVar('$QBN_deck')
		for(var i=0; i<passages.length; ++i) {
			var p = passages[i]
			if(typeof p === 'string') p = Story.get(p)
			if(deck[p.title] === 0) delete deck[p.title]
			if(wrap) {
				var title = JSON.stringify(p.title)
				$output.wiki('<<'+wrap+' '+title+'>>')
			} else {
				var deck = getVar('$QBN_deck')
				if(deck[title] === 0) delete deck[title]
				$output.wiki(p.processText())
			}
			if(separate && i < passages.length - 1) {
				if(Macro.has(separate)) {
					$output.wiki('<<'+separate+' '+(i===passages.length-2)+'>>')
				} else {
					$output.append(document.createTextNode(separate))
				}
			}
		}
	}
})


function addTo(set, passage) {
	var title = (typeof passage === 'string') ? passage : passage.title
	var newPassage = !set[title]
	if(newPassage) set[title] = true
	return newPassage
}

function firstWord(string) {
	var i = string.indexOf(" ")
	return string.substr(0, i == -1 ? string.length : i)
}

Macro.add('drawcards', {
	handler: function() {
		try {
			var hand = this.args[0], n = this.args[1], passages = this.args[2]
			if(!hand) {
				// Only handles actual variables, not backquoted
				// expressions or whatever. WHY isn't there a way
				// to use Sugarcube's parser for this??!?
				hand = []
				var name = firstWord(this.args.raw)
				if(!setVar(name, hand)) {
					return this.error('<<drawcards>>: failed to set hand "' + name + '".')
				}
				console.log('Empty Hand: setting ' + name + ' to [].')
			}
			var i, set = {}
			for(i=0; i<hand.length; ++i) addTo(set, hand[i])
			passages = passages.filter(function(p){ return addTo(set, p) })
			passages = choose(passages, n - hand.length)
			for(i=0; i<passages.length; ++i) hand.push(passages[i])
		} catch(err) {
			return this.error('<<drawcards>>: ' + (typeof err === 'object' ? err.message : err))
		}
	}
})
