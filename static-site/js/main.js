$(document).ready(function() {
    $.get('/commits.json', function(data) {
        $('#commits').append('<ul id="commits-list">')
        $.each(data, function(idx, commit) {
            $('#commits-list').append('<li>' + commit['sha'].slice(0, 6) + '\t' + commit['message'].slice(0, 50) + '</li>')
        });
        $('#commits').append('</ul>');
    });
});