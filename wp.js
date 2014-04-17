var myVersion = "0.43";

//last build 4/17/2014; 1:03:26 PM

var http = require ("http");
var AWS = require ("aws-sdk");
var s3 = new AWS.S3 ();
var urlpack = require ("url");
var xmlrpc = require ("xmlrpc");

var myPort = process.env.PORT;
var whenServerStart = new Date ();
var ctHits = 0;

function xmlEncodeString (s) {
	var map = {
		"<": "&lt;",
		">": "&gt;",
		"&": "&amp;",
		'"': "&"+"quot;"
		};
	s = s.toString ();
	s = s.replace (/\u00A0/g, " ");
	var escaped = s.replace (/[<>&"]/g, function (ch) {
		return (map [ch]);
		});
	return (escaped);
	}
function filledString (ch, ct) {
	var s = "";
	for (var i = 0; i < ct; i++) {
		s += ch;
		}
	return (s);
	}
function trimWhitespace (s) {
	function isWhite (ch) {
		return ((ch == " ") || (ch == "\t") || (ch == "\n"));
		}
	while (s.length > 0) {
		if (isWhite (s [0])) {
			s = s.substr (1)
			}
		else {
			break;
			}
		}
	while (s.length > 0) {
		if (isWhite (s [s.length - 1])) {
			s = s.substr (0, s.length - 1)
			}
		else {
			break;
			}
		}
	return (s);
	}
function getParagraphs (s, callback) {
	if (callback != undefined) {
		if (s.indexOf ("</p>") == -1) { //look for cr-lf-cr-lf paragraph delimiters
			while (true) {
				s = trimWhitespace (s);
				if (s.length == 0) {
					break;
					}
				
				var ixpgfend = s.indexOf ("\r\n\r\n");
				if (ixpgfend == -1) {
					callback (s);
					break;
					}
				var pgfstring = s.substr (0, ixpgfend);
				callback (pgfstring);
				
				s = s.substr (ixpgfend + 4);
				}
			}
		else {
			while (true) {
				s = trimWhitespace (s);
				if (s.length == 0) {
					break;
					}
				if (s.length < 2) {
					callback (s);
					break;
					}
				if ((s [0] != "<") || (s [1].toLowerCase () != "p")) {
					callback (s);
					break;
					}
				var ixanglebracket = s.indexOf (">");
				if (ixanglebracket == -1) {
					callback (s);
					break;
					}
				s = s.substr (ixanglebracket + 1);
				
				var ixclose = s.toLowerCase ().indexOf ("</p>");
				if (ixclose == -1) {
					callback (s);
					break;
					}
				
				var pgfstring = s.substr (0, ixclose);
				callback (pgfstring);
				
				s = s.substr (ixclose + 4);
				}
			}
		}
	}
function wpGetPosts (host, port, endpoint, username, password, callback, offset) {
	var client = xmlrpc.createClient ({host: host, port: port, path: endpoint})
	var ctper = 10;
	function getset (offset) {
		client.methodCall ("wp.getPosts", [1, username, password, {number: ctper, offset: offset}], function (error, value) {
			if (error) {
				console.log ("wpGetPosts: error == " + error.message);
				}
			else {
				callback (value, false);
				if (value.length == ctper) {
					getset (offset + ctper);
					}
				else {
					callback (undefined, true);
					}
				}
			});
		}
	getset (0);
	}
function wpToOpml (host, port, endpoint, username, password, callback) {
	var opmltext = "", indentlevel = 0;
	function add (s) {
		opmltext += filledString ("\t", indentlevel) + s + "\n";
		}
	//set up top of OPML document
		add ("<opml version=\"2.0\">"); indentlevel++;
		//<head> section -- there doesn't seem to be an API call to get info about the blog, title, creation date, etc
			add ("<head>"); indentlevel++;
			add ("<title>" + xmlEncodeString (host) + "</title>");
			add ("<expansionState />");
			add ("</head>"); indentlevel--;
		add ("<body>"); indentlevel++;
	
	wpGetPosts (host, port, endpoint, username, password, function (postarray, flEndOutline) {
		if (flEndOutline) {
			add ("</body>"); indentlevel--;
			add ("</opml>"); indentlevel--;
			callback (opmltext);
			}
		else {
			for (var i = 0; i < postarray.length; i++) {
				var x = postarray [i];
				add ("<outline text=\"" + xmlEncodeString (trimWhitespace (x.post_title)) + "\" type=\"metaWeblogPost\" idpost=\"" + x.post_id + "\" ctSaves=\"0\" url=\"" + x.link + "\" created=\"" + x.post_date + "\">"); //indentlevel++;
				getParagraphs (x.post_content, function (s) {
					add ("<outline text=\"" + xmlEncodeString (trimWhitespace (s)) + "\" created=\"" + x.post_date + "\" />");
					});
				add ("</outline>"); indentlevel--;
				}
			}
		});
	}

console.log ("WordPress-to-OPML v" + myVersion + " running on port " + myPort + ".");

http.createServer (function (httpRequest, httpResponse) {
	var parsedUrl = urlpack.parse (httpRequest.url, true), now = new Date ();
	ctHits++;
	console.log ("Received request: " + httpRequest.url);
	switch (parsedUrl.pathname.toLowerCase ()) {
		case "/version":
			httpResponse.writeHead (200, {"Content-Type": "text/plain"});
			httpResponse.end (myVersion);    
			return;
		case "/now":
			httpResponse.writeHead (200, {"Content-Type": "text/plain"});
			httpResponse.end (now.toString ());    
			return;
		case "/convert":
			var host = parsedUrl.query.host, port = parsedUrl.query.port;
			var endpoint = parsedUrl.query.endpoint, username = parsedUrl.query.username;
			var password = parsedUrl.query.password;
			wpToOpml (host, port, endpoint, username, password, function (opmltext) {
				httpResponse.writeHead (200, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});
				httpResponse.end (opmltext);    
				});
			return;
		case "/status": 
			var myStatus = {
				version: myVersion, 
				now: now.toUTCString (), 
				whenServerStart: whenServerStart.toUTCString (), 
				hits: ctHits, 
				hitsToday: ctHits
				};
			httpResponse.writeHead (200, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});
			httpResponse.end (JSON.stringify (myStatus, undefined, 4));    
			break;
		}
	}).listen (myPort);
