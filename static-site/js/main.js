$(document).ready(function() {
    $.get('/commits.json', function(data) {
        $('#commits').append('<ul id="commits-list">')
        $.each(JSON.parse(data), function(idx, commit) {
            $('#commits-list').append(
                '<li>' +
                  // 50 from https://chris.beams.io/posts/git-commit/
                  '<code>' + commit['sha'].slice(0, 6) + '</code>\t' +
                  '<a href="' + commit['url'] + '">' + commit['title'].slice(0, 50) + '</a>' +
                '</li>'
            );
        });
        $('#commits').append('</ul>');
    });
});