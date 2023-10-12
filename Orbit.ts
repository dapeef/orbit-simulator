//#region document references
let can = document.getElementById ("Canvas") as HTMLCanvasElement
let c = can.getContext ("2d")

let play_pause = document.getElementById ("PlayPause")
play_pause.addEventListener ("click", (e : Event) => togglePlayPause ())

let regen = document.getElementById ("Regen")
regen.addEventListener ("click", (e : Event) => regenerate ())

let scale = document.getElementById ("Scale") as HTMLInputElement
scale.addEventListener ("input", (e : Event) => sliderUpdate ())
let scale_label = document.getElementById ("ScaleValue")

let speed = document.getElementById ("Speed") as HTMLInputElement
speed.addEventListener ("input", (e : Event) => sliderUpdate ())
let speed_label = document.getElementById ("SpeedValue")

let tail_length = document.getElementById ("TailLength") as HTMLInputElement
tail_length.addEventListener ("input", (e : Event) => sliderUpdate ())
let tail_length_label = document.getElementById ("TailLengthValue")

let frame_rate_label = document.getElementById ("FrameRateValue")

let lump_settings_outer = document.getElementById ("LumpSettingsOuter")

let disposable_div = document.getElementById ("DisposableDiv")

let table = document.getElementById ("Table")
//#endregion

//#region variable declarations
let hex = "0123456789abcdef"

let paused = true

let cmTID
let last_frame_time = Date.now ()
let delta_time
let last_time_reference = Date.now ()
let frame_count_since_reference = 0

let lumps : Lump[] = []

let old_title_widths : number[] = []

let lump_settings_elements : HTMLInputElement[][]
let lump_delete_buttons : HTMLButtonElement[]
//#endregion

//#region classes
class Vector2 {
    x : number
    y : number

    //#region functions
    magnitude_unsquared () : number {
        return this.x ** 2 + this.y ** 2
    }

    magnitude () : number {
        return Math.sqrt (this.x ** 2 + this.y ** 2)
    }

    normalise () : Vector2 {
        return this.div (this.magnitude ())
    }

    angle () : number {
        return Math.atan2 (this.y, this.x)
    }

    clone () : Vector2 {return new Vector2 (this.x, this.y)}
    //#endregion


    constructor (x : number, y : number) {
        this.x = x
        this.y = y
    }

    //#region operators
    mul (scalar : number) : Vector2 {
        return new Vector2 (this.x * scalar, this.y * scalar)
    }

    div (scalar : number) : Vector2 {
        return new Vector2 (this.x / scalar, this.y / scalar)
    }

    add (vector : Vector2) : Vector2 {
        return new Vector2 (this.x + vector.x, this.y + vector.y)
    }

    sub (vector : Vector2) : Vector2 {
        return new Vector2 (this.x - vector.x, this.y - vector.y)
    }
    //#endregion
    

    static mean (vectors : Vector2[]) :  Vector2 {
        let mean = Vector2.zero

        vectors.forEach(vector => {
            mean = mean.add (vector)
        });

        mean = mean.div (vectors.length)

        return mean
    }

    static weightedMean (vectors : Vector2[], weights : number[]) :  Vector2 {
        let mean = Vector2.zero


        for (let i = 0; i < vectors.length; i++) {
            const vector = vectors[i]
            const weight = weights[i]
            
            mean = mean.add (vector.mul (weight))
        }

        mean = mean.div (weights.reduce ((acc, a) => acc + a))

        return mean
    }

    static angleBetween (vector1 : Vector2, vector2 : Vector2) {
        let a = vector1.normalise ();
        let b = vector2.normalise ();

        return Math.acos (a.x * b.x + a.y * b.y);
    }


    static zero = new Vector2 (0, 0)
}

class Lump {
    position : Vector2
    velocity : Vector2
    acceleration : Vector2
    mass : number
    size : number
    color : string
    name : string

    fixed : boolean

    trail = new Trail ()

    render () {
        c.beginPath ()
        c.arc (this.position.x, this.position.y, this.size, 0, Math.PI * 2)
        c.fillStyle = this.color
        c.fill ()

        if (this.trail.enabled) {
            //console.log (this.trail.penultimatePoint ())

            try {
                if (
                    Vector2.angleBetween (
                        this.position.sub (mean_position).sub (this.trail.lastPoint ()), this.trail.lastPoint ().sub (this.trail.penultimatePoint ())
                    ) > Math.PI / 36 
                    || this.position.sub (mean_position).sub (this.trail.lastPoint ()).magnitude () >= 50
                ) {
                    this.trail.addPoint (this.position.sub (mean_position))
                }
            } catch (e) {
                try {
                    console.log (e)
                    if (this.position.sub (mean_position) != this.trail.lastPoint ()) {
                        this.trail.addPoint (this.position.sub (mean_position))
                    }
                } catch (e) {
                    this.trail.addPoint (this.position.sub (mean_position))
                }
            }

            this.trail.render (this.color, this.position)
        } else {
            if (this.trail.lastPoint () != undefined) {
                this.trail.addBreakPoint ()
            }
        }

        if (this.trail.points.length > +tail_length.value / lumps.filter (lump => lump.trail.enabled).length) {
            this.trail.removeFirstPoint ()
        }
    }

    renderVelocity () {
        let standardised_velocity = this.velocity.sub (mean_velocity).mul (0.5)
        let start = this.position
        let end = this.position.add (standardised_velocity.mul (1))
        let line_end = this.position.add (standardised_velocity.mul (0.95))

        c.beginPath ()
        c.moveTo (start.x, start.y)
        c.lineTo (line_end.x, line_end.y)
        c.strokeStyle = this.color
        c.lineWidth = 5
        c.stroke ()

        let head_length = Math.max (standardised_velocity.magnitude () / 10, 30)
        let head_ratio = 1 / 3
        
        if (standardised_velocity.magnitude () > head_length + this.size) {
            c.save ()
            c.translate (end.x, end.y)
            c.rotate (standardised_velocity.angle ())

            c.beginPath ()
            c.moveTo (0, 0)
            c.lineTo (-head_length, -head_length * head_ratio)
            c.lineTo (-head_length, head_length * head_ratio)
            c.lineTo (0, 0)

            c.fillStyle = this.color
            c.fill ()

            c.restore ()
        }
    }

    meanPosition () : Vector2 {return this.position.sub (mean_position)}
    

    constructor (start_position : Vector2, start_velocity : Vector2, mass : number, size? : number, color? : string, name? : string, fixed? : boolean, trail? : boolean) {
        this.position = start_position
        this.velocity = start_velocity
        this.acceleration = Vector2.zero
        this.mass = mass
        this.size = size || mass + 5
        this.color = color || randomColour ()
        this.name = name || "Beautiful Lump"
        this.fixed = fixed
        this.trail.enabled = trail
    }
}

class Trail {
    points : Vector2[]
    
    enabled : boolean

    addPoint (point : Vector2) {
		this.points.push (point)
    }

    addBreakPoint () {
        this.points.push (undefined)
    }

    render (color : string, current_position : Vector2) {
        this.addPoint (current_position.sub (mean_position))

        while (this.points [0] == undefined) {
            this.removeFirstPoint ()
        }

        c.beginPath ()
        c.moveTo (this.meanPoint (0).x, this.meanPoint (0).y)

        for (let i = 1; i < this.points.length; i++) {
            const point = this.meanPoint (i)
            
            if (point != undefined) {
                c.lineTo (point.x, point.y)
            } else {
                c.strokeStyle = color
                c.lineWidth = 5
                c.stroke ()

                c.beginPath ()
            }

            c.strokeStyle = color
            c.lineWidth = 5
            c.stroke ()
        }

        this.points.pop ()
    }

    removeFirstPoint () {
        this.points = this.points.slice (1, this.points.length)
    }

    clear () {
        this.points = []
    }

    lastPoint () {return this.points [this.points.length - 1]}

    penultimatePoint () {return this.points [this.points.length - 2]}

    meanPoint (index) {
        try {
            return this.points [index].add (mean_position)
        } catch (e) {
            return undefined
        }
    }

    scrubUndefineds () {
        while (this.lastPoint () == undefined) {
            this.points.pop ()
        }
    }

    constructor () {
        this.points = []
    }
}
//#endregion

//#region functions
function random (lower : number, upper : number) : number {
    return Math.random () * (upper - lower) + lower
}

function randomColour () : string {
    let s = "#"

    for (let i = 0; i < 6; i++) {
        s +=  hex.charAt (random (0, 15))
    }

    return s
}

function fill0s(string : string, length : number) {
    if (string.indexOf (".") == -1) {
        string += "."
    }

    let leng = string.length
    for (let i = 0; i < length - leng; i++) {
        string += "0"
    }

    return string
}

function round(number : number, decimals : number) : number {
    return Math.round (number * 10**decimals) / 10**decimals
}


function togglePlayPause () {
    if (paused) {
        paused = false

        //frame ()

        play_pause.innerHTML = "||"
    } else {
        paused = true

        //clearTimeout (cmTID)

        play_pause.innerHTML = "▷"
    }

    createUIList ()

    render ()
}

function render () {
    c.fillStyle = "rgba(0,0,0,0.05)"
    c.fillRect (0, 0, can.width, can.height)

    if (paused) {
        current_camera_position = Vector2.weightedMean ([current_camera_position, mean_position.mul (-1)], [1, 10 * delta_time])
    } else {
        current_camera_position = mean_position.mul (-1)
    }

    if (lumps.filter (lump => lump.fixed).length != 0) {
        mean_position = Vector2.mean (lumps.filter (lump => lump.fixed).map (lump => lump.position))
        mean_velocity = Vector2.mean (lumps.filter (lump => lump.fixed).map (lump => lump.velocity))
    }

    c.save ()
    c.translate (can.width / 2, can.height / 2)
    c.scale (+scale.value, +scale.value)
    c.translate (current_camera_position.x, current_camera_position.y)

    lumps.forEach(lump => {
        lump.render ()

        if (paused) {
            lump.renderVelocity ()
        }
    })

    c.restore ()

    frame_count_since_reference ++

    if (Date.now () - last_time_reference > 250) {
        frame_rate_label.innerHTML = round (1000 * frame_count_since_reference / ((Date.now () - last_time_reference)), 1).toString () + " fps"

        last_time_reference = Date.now ()
        frame_count_since_reference = 0
    }
}

function frame () {
    delta_time = Math.min ((Date.now () - last_frame_time) / 1000, 0.02) * +speed.value
    last_frame_time = Date.now ()

    if (!paused) {
        for (let i = 0; i < lumps.length; i++) {
            const lump = lumps[i]

            let acceleration = Vector2.zero

            for (let j = 0; j < lumps.length; j++) {
                const lump_compare = lumps[j]
                
                if (i!=j) {
                    let difference = lump_compare.position.sub (lump.position)
                    acceleration = acceleration.add (difference.normalise ().mul (Math.min (lump_compare.mass / difference.magnitude_unsquared (), 0.01)))
                }
            }

            lump.acceleration = acceleration
        }
        
        for (let i = 0; i < lumps.length; i++) {
            const lump = lumps [i]

            lump.velocity = lump.velocity.add (lump.acceleration.mul (100000 * delta_time))

            lump.position = lump.position.add (lump.velocity.mul (delta_time))
        }

        createUIList ()
    }

    render ()

    cmTID = setTimeout (frame, 1)
}

function initiate () {
    lumps = [new Lump (new Vector2 (can.width / 2, can.height / 2), Vector2.zero, 2000, 20, "gold", "Sun", true),]
    //new Lump (new Vector2 (can.width / 2 + 200, can.height / 2), new Vector2 (0, 1000), 2000000, 20, "gold", "Sun2", true),
    //new Lump (new Vector2 (can.width / 2, can.height / 2 + 100), new Vector2 (1000, 0), 2000000, 20, "gold", "Sun3", true)]

    for (let i = 0; i < 3; i++) {
        addLump ()
    }

    paused = false
    createUIList ()
    paused = true
    createUIList ()
    
    frame ()
}

function regenerate () {
    let numLumps  = lumps.length

    lumps = [new Lump (new Vector2 (can.width / 2, can.height / 2), Vector2.zero, 2000, 20, "gold", "Sun1", true),]
    //new Lump (new Vector2 (can.width / 2 + 200, can.height / 2), new Vector2 (0, 1000), 2000000, 20, "gold", "Sun2", true),
    //new Lump (new Vector2 (can.width / 2, can.height / 2 + 100), new Vector2 (1000, 0), 2000000, 20, "gold", "Sun3", true)]

    for (let i = 0; i < numLumps - 1; i++) {
        addLump ()
    }

    /*if (!paused) {
        clearTimeout (cmTID)

        frame ()
    }*/

    render ()

    createUIList ()
}

function addLump () {
    lumps.push (new Lump (new Vector2 (random (0, 500), random (0, 500)), new Vector2 (random (-500, 500), random (-500, 500)), random (1, 10)))
}

function removeLump (lump_for_removal : Lump) {
    lumps = lumps.filter (lump => (lump != lump_for_removal))
    
    createUIList ()
}

function moveLump (lump_to_be_moved : Lump, new_index : number) {
    let temporary_lump = lumps [new_index]

    lumps [lumps.indexOf (lump_to_be_moved)] = temporary_lump
    lumps [new_index] = lump_to_be_moved

    createUIList ()
}

function createUIList () {
    disposable_div.parentElement.removeChild (disposable_div)

    disposable_div = createElement (lump_settings_outer, "div")

    table = document.createElement('table')
    disposable_div.appendChild (table)

    let tbody = document.createElement('tbody')
    table.appendChild (tbody)

    let titletr = createElement (tbody, "tr")

    lump_settings_elements = []
    lump_delete_buttons = []

    let title_elements : HTMLTableDataCellElement[] = []
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Name") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Position") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Velocity") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Mass") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Size") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Colour") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Focused") as HTMLTableDataCellElement)
    title_elements.push (createElement (createElement (titletr, "td"), "b", "Trail") as HTMLTableDataCellElement)

    lumps.forEach(lump => {
        let lumptr = createElement(tbody, 'tr')

        let tr_settings_elements : HTMLInputElement[] = []

        let editable : boolean[] = []

        if (paused) {
            editable = [
                true,
                !lump.fixed,
                !lump.fixed,
                true,
                true,
                true
            ]
        } else {
            editable = [
                false,
                false,
                false,
                false,
                false,
                false,
                false
            ]
        }


        if (editable [0]) {
            tr_settings_elements.push (
                createElement (
                    createElement (lumptr, "td"), "input", lump.name, "color: " + lump.color + "; width: " + old_title_widths[0] + "px"
                ) as HTMLInputElement
            )
        } else {
            createElement (createElement (lumptr, "td"), "p", lump.name, "color: " + lump.color)
        }

        let positiontd = createElement (lumptr, "td", undefined, "width: 60px")
        if (editable[1]) {
            tr_settings_elements.push (
                createElement (
                    positiontd, "input", round (lump.position.x - mean_position.x, 0).toString (), "color: " + lump.color + "; width: " + old_title_widths[1] + "px"
                ) as HTMLInputElement
            )
            tr_settings_elements.push (
                createElement (
                    positiontd, "input", round (-(lump.position.y - mean_position.y), 0).toString (), "color: " + lump.color + "; width: " + old_title_widths[1] + "px"
                ) as HTMLInputElement
            )
            tr_settings_elements [tr_settings_elements.length - 2].addEventListener ("click", (e : Event) => lump.trail.addBreakPoint ())
            tr_settings_elements [tr_settings_elements.length - 1].addEventListener ("click", (e : Event) => lump.trail.addBreakPoint ())
        } else {
            tr_settings_elements.push (undefined)
            tr_settings_elements.push (undefined)
            
            createElement (positiontd, "p", round (lump.position.x - mean_position.x, 0).toString (), "color: " + lump.color + "; height: 23px")
            createElement (positiontd, "p", round (-(lump.position.y - mean_position.y), 0).toString (), "color: " + lump.color + "; height: 23px")
        }

        let velocitytd = createElement (lumptr, "td", undefined, "width: 60px")
        if (editable[2]) {
            tr_settings_elements.push (
                createElement (
                    velocitytd, "input", round (lump.velocity.x - mean_velocity.x, 0).toString (), "color: " + lump.color + "; width: " + old_title_widths[2] + "px"
                ) as HTMLInputElement
            )
            tr_settings_elements.push (
                createElement (
                    velocitytd, "input", round (-(lump.velocity.y - mean_velocity.y), 0).toString (), "color: " + lump.color + "; width: " + old_title_widths[2] + "px"
                ) as HTMLInputElement
            )
        } else {
            tr_settings_elements.push (undefined)
            tr_settings_elements.push (undefined)
            
            createElement (velocitytd, "p", round (lump.velocity.x - mean_velocity.x, 0).toString (), "color: " + lump.color + "; height: 23px")
            createElement (velocitytd, "p", round (-(lump.velocity.y - mean_velocity.y, 0), 0).toString (), "color: " + lump.color + "; height: 23px")
        }

        if (editable[3]) {
            tr_settings_elements.push (
                createElement (
                    createElement (lumptr, "td"), "input", round (lump.mass, 2).toString (), "color: " + lump.color + "; width: " + old_title_widths[3] + "px"
                ) as HTMLInputElement
            )
        } else {
            createElement (createElement (lumptr, "td"), "p", round (lump.mass, 2).toString (), "color: " + lump.color)
        }

        if (editable[4]) {
            tr_settings_elements.push (
                createElement (
                    createElement (lumptr, "td"), "input", round (lump.size, 2).toString (), "color: " + lump.color + "; width: " + old_title_widths[4] + "px"
                ) as HTMLInputElement
            )
        } else {
            createElement (createElement (lumptr, "td"), "p", round (lump.size, 2).toString (), "color: " + lump.color)
        }

        if (editable[5]) {
            tr_settings_elements.push (
                createElement (
                    createElement (lumptr, "td"), "input", lump.color, "color: " + lump.color + "; width: " + old_title_widths[5] + "px"
                ) as HTMLInputElement
            )
        } else {
            createElement (createElement (lumptr, "td"), "p", lump.color, "color: " + lump.color)
        }

        tr_settings_elements.push (
            createElement (
                createElement (lumptr, "td"), "input", undefined, undefined, "checkbox", lump.fixed
            ) as HTMLInputElement
        )

        let trailtd = createElement (lumptr, "td")
        tr_settings_elements.push (
            createElement (
                trailtd, "input", undefined, undefined, "checkbox", lump.trail.enabled
            ) as HTMLInputElement
        )
        tr_settings_elements [tr_settings_elements.length - 1].addEventListener ("change", (e : Event) => {
            lump.trail.scrubUndefineds ()
            lump.trail.addPoint (lump.position.sub (mean_position))
        })
        createElement (trailtd, "button", "Clear trail").addEventListener ("click", (e : Event) => lump.trail.clear ())

        createElement (createElement (lumptr, "td"), "button", "Delete").addEventListener ("click", (e : Event) => removeLump (lump))

        let movetd = createElement (lumptr, "td")
        if (lump != lumps[0]) {
            createElement (movetd, "button", "Move Up").addEventListener ("click", (e : Event) => moveLump (lump, lumps.indexOf (lump) - 1))
        }
        if (lump != lumps[0] || lump != lumps[lumps.length - 1]) {
            createElement (movetd, "br")
        }
        if (lump != lumps[lumps.length - 1]) {
            createElement (movetd, "button", "Move Down").addEventListener ("click", (e : Event) => moveLump (lump, lumps.indexOf (lump) + 1))
        }

        lump_settings_elements.push (tr_settings_elements)
    });

    createElement (disposable_div, "button", "+", "margin: 5px").addEventListener ("click", (e : Event) => {addLump (); render (); createUIList ()})

    old_title_widths = title_elements.map (element => {return element.parentElement.offsetWidth - 2 * 5 - 6})
}

function createElement (parent : HTMLElement, type : string, content? : string, css? : string, input_type? : string, checked? : boolean) : HTMLElement {
    let element
    if (type == "input") {
        element = document.createElement("input") as HTMLInputElement
        element.type = input_type

        if (input_type == "checkbox") {
            element.checked = checked

            element.addEventListener ("change", (e : Event) => {updateLumps (); createUIList ()})
        } else if (input_type == "" || input_type == undefined) {
            element.value = content

            element.addEventListener ("input", (e : Event) => updateLumps ())
        }
    } else {
        element = document.createElement(type) as HTMLElement
    }
    element.textContent = content
    element.style.cssText = css
    parent.appendChild (element)

    return element
}

function updateLumps () {
    for (let i = 0; i < lumps.length; i++) {
        const lump = lumps [i]
        const element = lump_settings_elements [i]
        
        lump.name = element[0].value
        try {
            lump.position.x = +element[1].value + mean_position.x
            lump.position.y = -element[2].value + mean_position.y
            lump.velocity.x = +element[3].value + mean_velocity.x
            lump.velocity.y = -element[4].value + mean_velocity.y
        } catch (e) {}
        lump.mass = +element[5].value
        lump.size = +element[6].value
        lump.color = element[7].value
        lump.fixed = element[8].checked
        lump.trail.enabled = element[9].checked
    }

    render ()
}

function sliderUpdate () {
    scale_label.innerHTML = fill0s (scale.value, 6)
    speed_label.innerHTML = fill0s (speed.value, 4)
    tail_length_label.innerHTML = Math.round (+tail_length.value).toString ()

    render ()
}
//#endregion


let mean_position = new Vector2 (can.width / 2, can.height / 2)
let mean_velocity = Vector2.zero

let current_camera_position = Vector2.zero

initiate ()