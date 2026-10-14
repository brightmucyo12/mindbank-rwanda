const fs = require('fs');
const path = require('path');

// These base64 strings represent valid, compressed PNG images of exact dimensions.
// 192x192 solid color minimal PNG
const png192Base64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABTSURBVHhe7cExAQAAAMKg9U9tDB8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgFcNsW4AAX6w91MAAAAASUVORK5CYII=";

// 512x512 solid color minimal PNG
const png512Base64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNTLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVHhe7cEBDQAAAMKg909tDwcUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBuA0qgAAE8707rAAAAAElFTkSuQmCC";

try {
    fs.writeFileSync(path.join(__dirname, 'icon-192.png'), Buffer.from(png192Base64, 'base64'));
    fs.writeFileSync(path.join(__dirname, 'icon-512.png'), Buffer.from(png512Base64, 'base64'));
    console.log("SUCCESS: icon-192.png (192x192) and icon-512.png (512x512) created successfully!");
} catch (error) {
    console.error("Error writing icon files:", error);
}