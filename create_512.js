const fs = require('fs');
const path = require('path');

// Valid 512x512 PNG base64
const png512Base64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNTLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVHhe7cEBDQAAAMKg909tDwcUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBuA0qgAAE8707rAAAAAElFTkSuQmCC";

const filePath = path.join(__dirname, 'icon-512.png');

try {
    fs.writeFileSync(filePath, Buffer.from(png512Base64, 'base64'));
    console.log("SUCCESS: icon-512.png written successfully to:", filePath);
} catch (err) {
    console.error("FAILED to write icon-512.png:", err);
}