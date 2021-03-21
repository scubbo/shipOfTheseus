$(document).ready(function() {
    $.get('/commits.json', function(data) {
        console.log(data);
    })
})