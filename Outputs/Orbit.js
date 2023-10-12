//#region document references
var can = document.getElementById("Canvas");
var c = can.getContext("2d");
var play_pause = document.getElementById("PlayPause");
play_pause.addEventListener("click", function (e) { return togglePlayPause(); });
var regen = document.getElementById("Regen");
regen.addEventListener("click", function (e) { return regenerate(); });
var scale = document.getElementById("Scale");
scale.addEventListener("input", function (e) { return sliderUpdate(); });
var scale_label = document.getElementById("ScaleValue");
var speed = document.getElementById("Speed");
speed.addEventListener("input", function (e) { return sliderUpdate(); });
var speed_label = document.getElementById("SpeedValue");
var tail_length = document.getElementById("TailLength");
tail_length.addEventListener("input", function (e) { return sliderUpdate(); });
var tail_length_label = document.getElementById("TailLengthValue");
var frame_rate_label = document.getElementById("FrameRateValue");
var lump_settings_outer = document.getElementById("LumpSettingsOuter");
var disposable_div = document.getElementById("DisposableDiv");
var table = document.getElementById("Table");
//#endregion
//#region variable declarations
var hex = "0123456789abcdef";
var paused = true;
var cmTID;
var last_frame_time = Date.now();
var delta_time;
var last_time_reference = Date.now();
var frame_count_since_reference = 0;
var lumps = [];
var old_title_widths = [];
var lump_settings_elements;
var lump_delete_buttons;
//#endregion
//#region classes
var Vector2 = /** @class */ (function () {
    //#endregion
    function Vector2(x, y) {
        this.x = x;
        this.y = y;
    }
    //#region functions
    Vector2.prototype.magnitude_unsquared = function () {
        return Math.pow(this.x, 2) + Math.pow(this.y, 2);
    };
    Vector2.prototype.magnitude = function () {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
    };
    Vector2.prototype.normalise = function () {
        return this.div(this.magnitude());
    };
    Vector2.prototype.angle = function () {
        return Math.atan2(this.y, this.x);
    };
    Vector2.prototype.clone = function () { return new Vector2(this.x, this.y); };
    //#region operators
    Vector2.prototype.mul = function (scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    };
    Vector2.prototype.div = function (scalar) {
        return new Vector2(this.x / scalar, this.y / scalar);
    };
    Vector2.prototype.add = function (vector) {
        return new Vector2(this.x + vector.x, this.y + vector.y);
    };
    Vector2.prototype.sub = function (vector) {
        return new Vector2(this.x - vector.x, this.y - vector.y);
    };
    //#endregion
    Vector2.mean = function (vectors) {
        var mean = Vector2.zero;
        vectors.forEach(function (vector) {
            mean = mean.add(vector);
        });
        mean = mean.div(vectors.length);
        return mean;
    };
    Vector2.weightedMean = function (vectors, weights) {
        var mean = Vector2.zero;
        for (var i = 0; i < vectors.length; i++) {
            var vector = vectors[i];
            var weight = weights[i];
            mean = mean.add(vector.mul(weight));
        }
        mean = mean.div(weights.reduce(function (acc, a) { return acc + a; }));
        return mean;
    };
    Vector2.angleBetween = function (vector1, vector2) {
        var a = vector1.normalise();
        var b = vector2.normalise();
        return Math.acos(a.x * b.x + a.y * b.y);
    };
    Vector2.zero = new Vector2(0, 0);
    return Vector2;
}());
var Lump = /** @class */ (function () {
    function Lump(start_position, start_velocity, mass, size, color, name, fixed, trail) {
        this.trail = new Trail();
        this.position = start_position;
        this.velocity = start_velocity;
        this.acceleration = Vector2.zero;
        this.mass = mass;
        this.size = size || mass + 5;
        this.color = color || randomColour();
        this.name = name || "Beautiful Lump";
        this.fixed = fixed;
        this.trail.enabled = trail;
    }
    Lump.prototype.render = function () {
        c.beginPath();
        c.arc(this.position.x, this.position.y, this.size, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.fill();
        if (this.trail.enabled) {
            //console.log (this.trail.penultimatePoint ())
            try {
                if (Vector2.angleBetween(this.position.sub(mean_position).sub(this.trail.lastPoint()), this.trail.lastPoint().sub(this.trail.penultimatePoint())) > Math.PI / 36
                    || this.position.sub(mean_position).sub(this.trail.lastPoint()).magnitude() >= 50) {
                    this.trail.addPoint(this.position.sub(mean_position));
                }
            }
            catch (e) {
                try {
                    console.log(e);
                    if (this.position.sub(mean_position) != this.trail.lastPoint()) {
                        this.trail.addPoint(this.position.sub(mean_position));
                    }
                }
                catch (e) {
                    this.trail.addPoint(this.position.sub(mean_position));
                }
            }
            this.trail.render(this.color, this.position);
        }
        else {
            if (this.trail.lastPoint() != undefined) {
                this.trail.addBreakPoint();
            }
        }
        if (this.trail.points.length > +tail_length.value / lumps.filter(function (lump) { return lump.trail.enabled; }).length) {
            this.trail.removeFirstPoint();
        }
    };
    Lump.prototype.renderVelocity = function () {
        var standardised_velocity = this.velocity.sub(mean_velocity).mul(0.5);
        var start = this.position;
        var end = this.position.add(standardised_velocity.mul(1));
        var line_end = this.position.add(standardised_velocity.mul(0.95));
        c.beginPath();
        c.moveTo(start.x, start.y);
        c.lineTo(line_end.x, line_end.y);
        c.strokeStyle = this.color;
        c.lineWidth = 5;
        c.stroke();
        var head_length = Math.max(standardised_velocity.magnitude() / 10, 30);
        var head_ratio = 1 / 3;
        if (standardised_velocity.magnitude() > head_length + this.size) {
            c.save();
            c.translate(end.x, end.y);
            c.rotate(standardised_velocity.angle());
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(-head_length, -head_length * head_ratio);
            c.lineTo(-head_length, head_length * head_ratio);
            c.lineTo(0, 0);
            c.fillStyle = this.color;
            c.fill();
            c.restore();
        }
    };
    Lump.prototype.meanPosition = function () { return this.position.sub(mean_position); };
    return Lump;
}());
var Trail = /** @class */ (function () {
    function Trail() {
        this.points = [];
    }
    Trail.prototype.addPoint = function (point) {
        this.points.push(point);
    };
    Trail.prototype.addBreakPoint = function () {
        this.points.push(undefined);
    };
    Trail.prototype.render = function (color, current_position) {
        this.addPoint(current_position.sub(mean_position));
        while (this.points[0] == undefined) {
            this.removeFirstPoint();
        }
        c.beginPath();
        c.moveTo(this.meanPoint(0).x, this.meanPoint(0).y);
        for (var i = 1; i < this.points.length; i++) {
            var point = this.meanPoint(i);
            if (point != undefined) {
                c.lineTo(point.x, point.y);
            }
            else {
                c.strokeStyle = color;
                c.lineWidth = 5;
                c.stroke();
                c.beginPath();
            }
            c.strokeStyle = color;
            c.lineWidth = 5;
            c.stroke();
        }
        this.points.pop();
    };
    Trail.prototype.removeFirstPoint = function () {
        this.points = this.points.slice(1, this.points.length);
    };
    Trail.prototype.clear = function () {
        this.points = [];
    };
    Trail.prototype.lastPoint = function () { return this.points[this.points.length - 1]; };
    Trail.prototype.penultimatePoint = function () { return this.points[this.points.length - 2]; };
    Trail.prototype.meanPoint = function (index) {
        try {
            return this.points[index].add(mean_position);
        }
        catch (e) {
            return undefined;
        }
    };
    Trail.prototype.scrubUndefineds = function () {
        while (this.lastPoint() == undefined) {
            this.points.pop();
        }
    };
    return Trail;
}());
//#endregion
//#region functions
function random(lower, upper) {
    return Math.random() * (upper - lower) + lower;
}
function randomColour() {
    var s = "#";
    for (var i = 0; i < 6; i++) {
        s += hex.charAt(random(0, 15));
    }
    return s;
}
function fill0s(string, length) {
    if (string.indexOf(".") == -1) {
        string += ".";
    }
    var leng = string.length;
    for (var i = 0; i < length - leng; i++) {
        string += "0";
    }
    return string;
}
function round(number, decimals) {
    return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
function togglePlayPause() {
    if (paused) {
        paused = false;
        //frame ()
        play_pause.innerHTML = "||";
    }
    else {
        paused = true;
        //clearTimeout (cmTID)
        play_pause.innerHTML = "▷";
    }
    createUIList();
    render();
}
function render() {
    c.fillStyle = "rgba(0,0,0,0.05)";
    c.fillRect(0, 0, can.width, can.height);
    if (paused) {
        current_camera_position = Vector2.weightedMean([current_camera_position, mean_position.mul(-1)], [1, 10 * delta_time]);
    }
    else {
        current_camera_position = mean_position.mul(-1);
    }
    if (lumps.filter(function (lump) { return lump.fixed; }).length != 0) {
        mean_position = Vector2.mean(lumps.filter(function (lump) { return lump.fixed; }).map(function (lump) { return lump.position; }));
        mean_velocity = Vector2.mean(lumps.filter(function (lump) { return lump.fixed; }).map(function (lump) { return lump.velocity; }));
    }
    c.save();
    c.translate(can.width / 2, can.height / 2);
    c.scale(+scale.value, +scale.value);
    c.translate(current_camera_position.x, current_camera_position.y);
    lumps.forEach(function (lump) {
        lump.render();
        if (paused) {
            lump.renderVelocity();
        }
    });
    c.restore();
    frame_count_since_reference++;
    if (Date.now() - last_time_reference > 250) {
        frame_rate_label.innerHTML = round(1000 * frame_count_since_reference / ((Date.now() - last_time_reference)), 1).toString() + " fps";
        last_time_reference = Date.now();
        frame_count_since_reference = 0;
    }
}
function frame() {
    delta_time = Math.min((Date.now() - last_frame_time) / 1000, 0.02) * +speed.value;
    last_frame_time = Date.now();
    if (!paused) {
        for (var i = 0; i < lumps.length; i++) {
            var lump = lumps[i];
            var acceleration = Vector2.zero;
            for (var j = 0; j < lumps.length; j++) {
                var lump_compare = lumps[j];
                if (i != j) {
                    var difference = lump_compare.position.sub(lump.position);
                    acceleration = acceleration.add(difference.normalise().mul(Math.min(lump_compare.mass / difference.magnitude_unsquared(), 0.01)));
                }
            }
            lump.acceleration = acceleration;
        }
        for (var i = 0; i < lumps.length; i++) {
            var lump = lumps[i];
            lump.velocity = lump.velocity.add(lump.acceleration.mul(100000 * delta_time));
            lump.position = lump.position.add(lump.velocity.mul(delta_time));
        }
        createUIList();
    }
    render();
    cmTID = setTimeout(frame, 1);
}
function initiate() {
    lumps = [new Lump(new Vector2(can.width / 2, can.height / 2), Vector2.zero, 2000, 20, "gold", "Sun", true),];
    //new Lump (new Vector2 (can.width / 2 + 200, can.height / 2), new Vector2 (0, 1000), 2000000, 20, "gold", "Sun2", true),
    //new Lump (new Vector2 (can.width / 2, can.height / 2 + 100), new Vector2 (1000, 0), 2000000, 20, "gold", "Sun3", true)]
    for (var i = 0; i < 3; i++) {
        addLump();
    }
    paused = false;
    createUIList();
    paused = true;
    createUIList();
    frame();
}
function regenerate() {
    var numLumps = lumps.length;
    lumps = [new Lump(new Vector2(can.width / 2, can.height / 2), Vector2.zero, 2000, 20, "gold", "Sun1", true),];
    //new Lump (new Vector2 (can.width / 2 + 200, can.height / 2), new Vector2 (0, 1000), 2000000, 20, "gold", "Sun2", true),
    //new Lump (new Vector2 (can.width / 2, can.height / 2 + 100), new Vector2 (1000, 0), 2000000, 20, "gold", "Sun3", true)]
    for (var i = 0; i < numLumps - 1; i++) {
        addLump();
    }
    /*if (!paused) {
        clearTimeout (cmTID)

        frame ()
    }*/
    render();
    createUIList();
}
function addLump() {
    lumps.push(new Lump(new Vector2(random(0, 500), random(0, 500)), new Vector2(random(-500, 500), random(-500, 500)), random(1, 10)));
}
function removeLump(lump_for_removal) {
    lumps = lumps.filter(function (lump) { return (lump != lump_for_removal); });
    createUIList();
}
function moveLump(lump_to_be_moved, new_index) {
    var temporary_lump = lumps[new_index];
    lumps[lumps.indexOf(lump_to_be_moved)] = temporary_lump;
    lumps[new_index] = lump_to_be_moved;
    createUIList();
}
function createUIList() {
    disposable_div.parentElement.removeChild(disposable_div);
    disposable_div = createElement(lump_settings_outer, "div");
    table = document.createElement('table');
    disposable_div.appendChild(table);
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    var titletr = createElement(tbody, "tr");
    lump_settings_elements = [];
    lump_delete_buttons = [];
    var title_elements = [];
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Name"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Position"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Velocity"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Mass"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Size"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Colour"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Focused"));
    title_elements.push(createElement(createElement(titletr, "td"), "b", "Trail"));
    lumps.forEach(function (lump) {
        var lumptr = createElement(tbody, 'tr');
        var tr_settings_elements = [];
        var editable = [];
        if (paused) {
            editable = [
                true,
                !lump.fixed,
                !lump.fixed,
                true,
                true,
                true
            ];
        }
        else {
            editable = [
                false,
                false,
                false,
                false,
                false,
                false,
                false
            ];
        }
        if (editable[0]) {
            tr_settings_elements.push(createElement(createElement(lumptr, "td"), "input", lump.name, "color: " + lump.color + "; width: " + old_title_widths[0] + "px"));
        }
        else {
            createElement(createElement(lumptr, "td"), "p", lump.name, "color: " + lump.color);
        }
        var positiontd = createElement(lumptr, "td", undefined, "width: 60px");
        if (editable[1]) {
            tr_settings_elements.push(createElement(positiontd, "input", round(lump.position.x - mean_position.x, 0).toString(), "color: " + lump.color + "; width: " + old_title_widths[1] + "px"));
            tr_settings_elements.push(createElement(positiontd, "input", round(-(lump.position.y - mean_position.y), 0).toString(), "color: " + lump.color + "; width: " + old_title_widths[1] + "px"));
            tr_settings_elements[tr_settings_elements.length - 2].addEventListener("click", function (e) { return lump.trail.addBreakPoint(); });
            tr_settings_elements[tr_settings_elements.length - 1].addEventListener("click", function (e) { return lump.trail.addBreakPoint(); });
        }
        else {
            tr_settings_elements.push(undefined);
            tr_settings_elements.push(undefined);
            createElement(positiontd, "p", round(lump.position.x - mean_position.x, 0).toString(), "color: " + lump.color + "; height: 23px");
            createElement(positiontd, "p", round(-(lump.position.y - mean_position.y), 0).toString(), "color: " + lump.color + "; height: 23px");
        }
        var velocitytd = createElement(lumptr, "td", undefined, "width: 60px");
        if (editable[2]) {
            tr_settings_elements.push(createElement(velocitytd, "input", round(lump.velocity.x - mean_velocity.x, 0).toString(), "color: " + lump.color + "; width: " + old_title_widths[2] + "px"));
            tr_settings_elements.push(createElement(velocitytd, "input", round(-(lump.velocity.y - mean_velocity.y), 0).toString(), "color: " + lump.color + "; width: " + old_title_widths[2] + "px"));
        }
        else {
            tr_settings_elements.push(undefined);
            tr_settings_elements.push(undefined);
            createElement(velocitytd, "p", round(lump.velocity.x - mean_velocity.x, 0).toString(), "color: " + lump.color + "; height: 23px");
            createElement(velocitytd, "p", round(-(lump.velocity.y - mean_velocity.y, 0), 0).toString(), "color: " + lump.color + "; height: 23px");
        }
        if (editable[3]) {
            tr_settings_elements.push(createElement(createElement(lumptr, "td"), "input", round(lump.mass, 2).toString(), "color: " + lump.color + "; width: " + old_title_widths[3] + "px"));
        }
        else {
            createElement(createElement(lumptr, "td"), "p", round(lump.mass, 2).toString(), "color: " + lump.color);
        }
        if (editable[4]) {
            tr_settings_elements.push(createElement(createElement(lumptr, "td"), "input", round(lump.size, 2).toString(), "color: " + lump.color + "; width: " + old_title_widths[4] + "px"));
        }
        else {
            createElement(createElement(lumptr, "td"), "p", round(lump.size, 2).toString(), "color: " + lump.color);
        }
        if (editable[5]) {
            tr_settings_elements.push(createElement(createElement(lumptr, "td"), "input", lump.color, "color: " + lump.color + "; width: " + old_title_widths[5] + "px"));
        }
        else {
            createElement(createElement(lumptr, "td"), "p", lump.color, "color: " + lump.color);
        }
        tr_settings_elements.push(createElement(createElement(lumptr, "td"), "input", undefined, undefined, "checkbox", lump.fixed));
        var trailtd = createElement(lumptr, "td");
        tr_settings_elements.push(createElement(trailtd, "input", undefined, undefined, "checkbox", lump.trail.enabled));
        tr_settings_elements[tr_settings_elements.length - 1].addEventListener("change", function (e) {
            lump.trail.scrubUndefineds();
            lump.trail.addPoint(lump.position.sub(mean_position));
        });
        createElement(trailtd, "button", "Clear trail").addEventListener("click", function (e) { return lump.trail.clear(); });
        createElement(createElement(lumptr, "td"), "button", "Delete").addEventListener("click", function (e) { return removeLump(lump); });
        var movetd = createElement(lumptr, "td");
        if (lump != lumps[0]) {
            createElement(movetd, "button", "Move Up").addEventListener("click", function (e) { return moveLump(lump, lumps.indexOf(lump) - 1); });
        }
        if (lump != lumps[0] || lump != lumps[lumps.length - 1]) {
            createElement(movetd, "br");
        }
        if (lump != lumps[lumps.length - 1]) {
            createElement(movetd, "button", "Move Down").addEventListener("click", function (e) { return moveLump(lump, lumps.indexOf(lump) + 1); });
        }
        lump_settings_elements.push(tr_settings_elements);
    });
    createElement(disposable_div, "button", "+", "margin: 5px").addEventListener("click", function (e) { addLump(); render(); createUIList(); });
    old_title_widths = title_elements.map(function (element) { return element.parentElement.offsetWidth - 2 * 5 - 6; });
}
function createElement(parent, type, content, css, input_type, checked) {
    var element;
    if (type == "input") {
        element = document.createElement("input");
        element.type = input_type;
        if (input_type == "checkbox") {
            element.checked = checked;
            element.addEventListener("change", function (e) { updateLumps(); createUIList(); });
        }
        else if (input_type == "" || input_type == undefined) {
            element.value = content;
            element.addEventListener("input", function (e) { return updateLumps(); });
        }
    }
    else {
        element = document.createElement(type);
    }
    element.textContent = content;
    element.style.cssText = css;
    parent.appendChild(element);
    return element;
}
function updateLumps() {
    for (var i = 0; i < lumps.length; i++) {
        var lump = lumps[i];
        var element = lump_settings_elements[i];
        lump.name = element[0].value;
        try {
            lump.position.x = +element[1].value + mean_position.x;
            lump.position.y = -element[2].value + mean_position.y;
            lump.velocity.x = +element[3].value + mean_velocity.x;
            lump.velocity.y = -element[4].value + mean_velocity.y;
        }
        catch (e) { }
        lump.mass = +element[5].value;
        lump.size = +element[6].value;
        lump.color = element[7].value;
        lump.fixed = element[8].checked;
        lump.trail.enabled = element[9].checked;
    }
    render();
}
function sliderUpdate() {
    scale_label.innerHTML = fill0s(scale.value, 6);
    speed_label.innerHTML = fill0s(speed.value, 4);
    tail_length_label.innerHTML = Math.round(+tail_length.value).toString();
    render();
}
//#endregion
var mean_position = new Vector2(can.width / 2, can.height / 2);
var mean_velocity = Vector2.zero;
var current_camera_position = Vector2.zero;
initiate();
//# sourceMappingURL=Orbit.js.map